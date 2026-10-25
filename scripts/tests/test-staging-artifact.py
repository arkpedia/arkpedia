import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import sys
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('staging_artifact', Path(__file__).parents[1] / 'deploy/staging-artifact.py')
artifact = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(artifact)


class StagingArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.archive = self.root / 'staging.tgz'
        self.record = self.root / 'receipt.json'
        self.config = self.root / 'reviewed.jsonc'
        self.config.write_bytes(b'{"name":"arkpedia-staging"}')
        self.commit = 'a' * 40
        self.info = {'version': 1, 'commit': self.commit, 'dirty': False,
                     'deploymentRole': 'staging', 'contentChannel': 'live',
                     'codeFingerprint': 'b' * 64, 'contentSchema': 2}

    def write_archive(self, extra=(), info=None):
        data = json.dumps(self.info if info is None else info).encode()
        with tarfile.open(self.archive, 'w:gz') as archive:
            for name, contents in [(artifact.INFO, data), ('public/build-info.json', data),
                                   (artifact.CONFIG, self.config.read_bytes()),
                                   ('.open-next/worker.js', b'not executed')]:
                member = tarfile.TarInfo(name)
                member.size = len(contents)
                archive.addfile(member, io.BytesIO(contents))
            for member in extra:
                archive.addfile(member, io.BytesIO(b'x') if member.isfile() else None)

    def make_receipt(self):
        self.record.write_text(json.dumps(artifact.receipt(self.archive, self.commit, '123')))

    def verify(self, **kwargs):
        return artifact.verify_extract(self.archive, self.record,
                                       kwargs.get('commit', self.commit), kwargs.get('run', '123'),
                                       self.config, kwargs.get('destination'),
                                       kwargs.get('without_prerender_cache', False))

    def test_receipt_and_fresh_extraction_preserve_bytes(self):
        self.write_archive()
        self.make_receipt()
        output = self.root / 'fresh'
        self.verify(destination=output)
        self.assertEqual((output / '.open-next/worker.js').read_bytes(), b'not executed')
        with self.assertRaisesRegex(ValueError, 'must not already exist'):
            self.verify(destination=output)

    def test_rejects_wrong_run_commit_config_and_modified_archive(self):
        self.write_archive()
        self.make_receipt()
        with self.assertRaises(ValueError):
            self.verify(run='124')
        with self.assertRaises(ValueError):
            self.verify(commit='c' * 40)
        self.config.write_bytes(b'{"name":"arkpedia"}')
        with self.assertRaisesRegex(ValueError, 'separately reviewed'):
            self.verify()
        self.write_archive()
        with self.assertRaisesRegex(ValueError, 'receipt mismatch'):
            self.verify()

    def test_rejects_dirty_or_wrong_role_channel_schema_identity(self):
        for change in [{'dirty': True}, {'deploymentRole': 'production'},
                       {'contentChannel': 'dev-live'}, {'contentSchema': None},
                       {'codeFingerprint': ''}, {'commit': 'c' * 40}]:
            with self.subTest(change=change):
                self.write_archive(info={**self.info, **change})
                with self.assertRaises(ValueError):
                    self.make_receipt()

    def test_rejects_escape_unexpected_paths_duplicates_and_links_before_writing(self):
        for name, kind in [('../escape', tarfile.REGTYPE), ('/absolute', tarfile.REGTYPE),
                           ('.open-next/../escape', tarfile.REGTYPE), ('C:/escape', tarfile.REGTYPE),
                           ('.open-next\\escape', tarfile.REGTYPE), ('package.json', tarfile.REGTYPE),
                           (artifact.INFO, tarfile.REGTYPE), ('.open-next/link', tarfile.SYMTYPE),
                           ('.open-next/hardlink', tarfile.LNKTYPE)]:
            with self.subTest(name=name, kind=kind):
                member = tarfile.TarInfo(name)
                member.type = kind
                member.linkname = '../../escape'
                self.write_archive(extra=[member])
                with self.assertRaises(ValueError):
                    self.make_receipt()
        self.assertFalse((self.root / 'escape').exists())

    def test_rejects_disagreeing_public_identity(self):
        self.write_archive()
        # Rebuild with a second, otherwise valid public identity.
        with tarfile.open(self.archive, 'w:gz') as archive:
            for name, info in [(artifact.INFO, self.info),
                               ('public/build-info.json', {**self.info, 'contentSchema': 3})]:
                data = json.dumps(info).encode()
                member = tarfile.TarInfo(name)
                member.size = len(data)
                archive.addfile(member, io.BytesIO(data))
            worker = tarfile.TarInfo('.open-next/worker.js')
            worker.size = 1
            archive.addfile(worker, io.BytesIO(b'x'))
        with self.assertRaisesRegex(ValueError, 'identities disagree'):
            self.make_receipt()

    def test_resource_budgets_are_enforced(self):
        self.write_archive()
        for limit in ['MAX_ARCHIVE', 'MAX_EXPANDED', 'MAX_FILE', 'MAX_ENTRIES']:
            with self.subTest(limit=limit), patch.object(artifact, limit, 1):
                with self.assertRaises(ValueError):
                    self.make_receipt()

    def test_reviewed_config_line_endings_are_portable_but_content_is_exact(self):
        self.config.write_bytes(b'{\n  "name": "arkpedia-staging"\n}\n')
        self.write_archive()
        self.make_receipt()
        self.config.write_bytes(self.config.read_bytes().replace(b'\n', b'\r\n'))
        self.verify()
        self.config.write_bytes(b'{\n  "name": "arkpedia"\n}\n')
        with self.assertRaisesRegex(ValueError, 'separately reviewed'):
            self.verify()

    def test_cold_cache_extraction_verifies_original_archive_and_omits_only_cache(self):
        cache = tarfile.TarInfo('.open-next/cache/entry:1')
        cache.size = 1
        asset = tarfile.TarInfo('.open-next/assets/cache-label.txt')
        asset.size = 1
        self.write_archive(extra=[cache, asset])
        self.make_receipt()
        original = json.loads(self.record.read_text())
        output = self.root / 'cold'
        result = self.verify(destination=output, without_prerender_cache=True)
        self.assertEqual(result['sha256'], original['sha256'])
        self.assertEqual(result['expandedBytes'], original['expandedBytes'])
        self.assertEqual(result['extraction']['excludedEntries'], 1)
        self.assertEqual(result['extraction']['excludedBytes'], 1)
        self.assertFalse((output / '.open-next/cache').exists())
        self.assertEqual((output / '.open-next/assets/cache-label.txt').read_bytes(), b'x')
        self.assertEqual((output / '.open-next/worker.js').read_bytes(), b'not executed')
        with self.assertRaisesRegex(ValueError, 'receipt mismatch'):
            self.write_archive(extra=[asset])
            self.verify(destination=self.root / 'other', without_prerender_cache=True)

    def test_omitted_cache_still_rejects_unsafe_paths_and_links_before_any_write(self):
        for name, kind in [('.open-next/cache/../escape', tarfile.REGTYPE),
                           ('.open-next/cache/link', tarfile.SYMTYPE)]:
            member = tarfile.TarInfo(name)
            member.type = kind
            member.linkname = '../../escape'
            self.write_archive(extra=[member])
            with self.assertRaises(ValueError):
                self.make_receipt()
        self.assertFalse((self.root / 'escape').exists())

    def test_trusted_receipt_binds_preview_source_pr_check_and_controller(self):
        self.write_archive()
        argv = ['staging-artifact.py', 'receipt', '--archive', str(self.archive),
                '--receipt', str(self.record), '--commit', self.commit, '--run', '123',
                '--preview-pr', '10', '--preview-check-run', '20', '--preview-controller', 'c' * 40]
        with patch.object(sys, 'argv', argv), patch('sys.stdout', new_callable=io.StringIO):
            artifact.main()
        record = json.loads(self.record.read_text())
        self.assertEqual(record['previewRequest'], {'pr': 10, 'source': self.commit,
                                                   'checkRun': 20, 'controllerCommit': 'c' * 40})
        self.verify()

    def test_partial_or_malformed_preview_identity_cannot_produce_receipt(self):
        self.write_archive()
        for flags in [('--preview-pr', '10'),
                      ('--preview-pr', '10;bad', '--preview-check-run', '20', '--preview-controller', 'c' * 40),
                      ('--preview-pr', '10', '--preview-check-run', '20', '--preview-controller', 'short')]:
            argv = ['staging-artifact.py', 'receipt', '--archive', str(self.archive),
                    '--receipt', str(self.record), '--commit', self.commit, '--run', '123', *flags]
            with patch.object(sys, 'argv', argv), self.assertRaises(ValueError):
                artifact.main()
            self.assertFalse(self.record.exists())


if __name__ == '__main__':
    unittest.main()

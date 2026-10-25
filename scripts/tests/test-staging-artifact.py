import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
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
                                       self.config, kwargs.get('destination'))

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


if __name__ == '__main__':
    unittest.main()

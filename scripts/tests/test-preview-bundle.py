import importlib.util
import io
import pathlib
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('extract_preview', pathlib.Path(__file__).parents[1] / 'deploy/extract-preview.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PreviewBundleTests(unittest.TestCase):
    def unpack(self, entries):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            archive = root / 'bundle.tgz'
            destination = root / 'output'
            destination.mkdir()
            with tarfile.open(archive, 'w:gz') as bundle:
                for name, kind in entries:
                    info = tarfile.TarInfo(name)
                    info.type = kind
                    if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE):
                        info.linkname = '../../publisher.mjs'
                    body = b'fixture' if kind == tarfile.REGTYPE else b''
                    info.size = len(body)
                    bundle.addfile(info, io.BytesIO(body))
            module.extract(archive, destination)
            return sorted(str(p.relative_to(destination)) for p in destination.rglob('*') if p.is_file())

    def test_generated_output_and_sql_only(self):
        names = ['.open-next/worker.js', '.open-next/assets/build-info.json', 'public/build-info.json', 'migrations/accounts/0001.sql']
        self.assertEqual(self.unpack([(name, tarfile.REGTYPE) for name in names]), sorted(names))

    def test_publisher_overwrites_and_traversal_rejected(self):
        for name in ['scripts/deploy/native-preview.mjs', 'package.json', 'wrangler.preview.jsonc', '../outside', '/tmp/outside', '.open-next/../../scripts/a', 'migrations/accounts/run.py', '.open-next\\..\\outside']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.unpack([(name, tarfile.REGTYPE)])

    def test_links_devices_and_duplicate_paths_rejected(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.FIFOTYPE]:
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                self.unpack([('.open-next/worker.js', kind)])
        with self.assertRaises(ValueError):
            self.unpack([('.open-next/worker.js', tarfile.REGTYPE)] * 2)


if __name__ == '__main__':
    unittest.main()

import importlib.util
import io
import json
from pathlib import Path
import stat
import unittest
import zipfile

SPEC = importlib.util.spec_from_file_location('preview_evidence', Path(__file__).parents[1] / 'deploy/read-preview-evidence.py')
READER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(READER)


def bundle(name='browser-evidence.json', body=b'{"schema":1}', extra=False, mode=None):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        entry = zipfile.ZipInfo(name)
        entry.compress_type = zipfile.ZIP_DEFLATED
        if mode is not None:
            entry.external_attr = mode << 16
        archive.writestr(entry, body)
        if extra:
            archive.writestr('other.json', b'{}')
    return output.getvalue()


class PreviewEvidenceTests(unittest.TestCase):
    def test_actual_zip_json_roundtrip_without_extraction(self):
        self.assertEqual(READER.read_evidence(bundle()), {'schema': 1})

    def test_path_escape_extra_files_and_links_are_rejected(self):
        for data in (bundle('../browser-evidence.json'), bundle(extra=True),
                     bundle(mode=stat.S_IFLNK | 0o777), bundle(mode=stat.S_IFCHR | 0o600)):
            with self.subTest(length=len(data)), self.assertRaises(ValueError):
                READER.read_evidence(data)

    def test_small_compressed_bomb_cannot_expand_past_budget(self):
        data = bundle(body=b' ' * (READER.MAX_BYTES + 1))
        self.assertLess(len(data), READER.MAX_BYTES)
        with self.assertRaises(ValueError):
            READER.read_evidence(data)

    def test_invalid_json_and_non_objects_are_rejected(self):
        for payload in (b'[]', b'null', b'not json', b'\xff'):
            with self.subTest(payload=payload), self.assertRaises((ValueError, UnicodeError)):
                READER.read_evidence(bundle(body=payload))

    def test_duplicate_file_entries_are_rejected(self):
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w') as archive:
            archive.writestr('browser-evidence.json', json.dumps({'schema': 1}))
            with self.assertWarns(UserWarning):
                archive.writestr('browser-evidence.json', '{}')
        with self.assertRaises(ValueError):
            READER.read_evidence(output.getvalue())


if __name__ == '__main__':
    unittest.main()

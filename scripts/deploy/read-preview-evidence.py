#!/usr/bin/env python3
"""Read one bounded GitHub policy artifact as JSON; never extract or execute it."""
import io
import json
import stat
import sys
import zipfile

MAX_BYTES = 5_000_000


def read_evidence(data):
    if not data or len(data) > MAX_BYTES:
        raise ValueError('Policy artifact exceeds compressed budget')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if len(entries) != 1:
            raise ValueError('Expected exactly one policy evidence file')
        entry = entries[0]
        mode = entry.external_attr >> 16
        if (entry.filename != 'browser-evidence.json' or entry.is_dir()
                or entry.flag_bits & 1 or entry.file_size > MAX_BYTES
                or stat.S_IFMT(mode) not in (0, stat.S_IFREG)):
            raise ValueError('Invalid policy evidence archive member')
        with archive.open(entry) as stream:
            payload = stream.read(MAX_BYTES + 1)
        if len(payload) > MAX_BYTES:
            raise ValueError('Policy evidence exceeds expanded budget')
        record = json.loads(payload.decode('utf-8'))
        if not isinstance(record, dict):
            raise ValueError('Policy evidence must be a JSON object')
        return record


if __name__ == '__main__':
    try:
        record = read_evidence(sys.stdin.buffer.read(MAX_BYTES + 1))
        sys.stdout.write(json.dumps(record, ensure_ascii=True, separators=(',', ':')))
    except (ValueError, OSError, RuntimeError, zipfile.BadZipFile, UnicodeError) as error:
        sys.stderr.write('Preview evidence refused: ' + str(error) + '\n')
        sys.exit(1)

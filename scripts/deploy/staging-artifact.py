#!/usr/bin/env python3
"""Record and verify staging build provenance without executing artifact code.

The receipt must come from the same reviewed GitHub run as the archive. It is a
checksum/provenance record, not an independent signature or deployment approval.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import tarfile

REPOSITORY = 'arkpedia/arkpedia'
MAX_ARCHIVE = 1024 ** 3
MAX_EXPANDED = 2 * 1024 ** 3
MAX_FILE = 256 * 1024 ** 2
MAX_ENTRIES = 100_000
INFO = '.open-next/assets/build-info.json'
CONFIG = 'wrangler.staging.jsonc'


def require(value, message):
    if not value:
        raise ValueError(message)


def identity(info, commit):
    require(re.fullmatch(r'[0-9a-f]{40}', commit), 'Expected a full commit SHA')
    require(isinstance(info, dict), 'Expected build identity object')
    require(type(info.get('version')) is int and info.get('version') == 1 and info.get('commit') == commit,
            'Build identity does not match the expected commit/version')
    require(info.get('dirty') is False and info.get('deploymentRole') == 'staging'
            and info.get('contentChannel') == 'live', 'Not a clean isolated live-data staging build')
    require(re.fullmatch(r'[0-9a-f]{64}', str(info.get('codeFingerprint', ''))),
            'Missing code fingerprint')
    require(type(info.get('contentSchema')) is int and info['contentSchema'] > 0,
            'Missing content schema')
    return {key: info[key] for key in (
        'version', 'commit', 'codeFingerprint', 'contentSchema',
        'contentChannel', 'deploymentRole', 'dirty')}


def inspect_archive(stream, commit):
    require(stream.seek(0, 2) <= MAX_ARCHIVE, 'Archive exceeds compressed budget')
    stream.seek(0)
    digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    stream.seek(0)
    archive = tarfile.open(fileobj=stream, mode='r:gz')
    members, seen, total = [], set(), 0
    for member in archive:
        path = PurePosixPath(member.name)
        require(member.name and not path.is_absolute() and not PureWindowsPath(member.name).drive
                and '\\' not in member.name and all(p not in ('', '.', '..') for p in member.name.split('/')),
                'Unsafe archive path')
        require(member.name == str(path), 'Non-canonical archive path')
        require(member.name not in seen, 'Duplicate archive path')
        require(member.isfile() or member.isdir(), 'Archive links/special files are forbidden')
        require(member.name == '.open-next' or member.name.startswith('.open-next/')
                or member.name in (CONFIG, 'public', 'public/build-info.json'),
                'Unexpected archive path')
        require(0 <= member.size <= MAX_FILE, 'Archive member exceeds size budget')
        total += member.size
        require(total <= MAX_EXPANDED and len(members) < MAX_ENTRIES, 'Archive exceeds expanded budget')
        members.append(member)
        seen.add(member.name)
    by_name = {m.name: m for m in members}
    require('.open-next/worker.js' in by_name and by_name['.open-next/worker.js'].isfile()
            and by_name['.open-next/worker.js'].size > 0, 'Missing Worker entry point')

    def read_small(name):
        member = by_name.get(name)
        require(member is not None and member.isfile() and member.size <= 65536,
                'Missing or oversized metadata: ' + name)
        return archive.extractfile(member).read()

    build = identity(json.loads(read_small(INFO)), commit)
    require(identity(json.loads(read_small('public/build-info.json')), commit) == build,
            'Public and Worker build identities disagree')
    config_hash = hashlib.sha256(read_small(CONFIG).replace(b'\r\n', b'\n')).hexdigest()
    return archive, members, {
        'sha256': digest, 'build': build, 'configSha256': config_hash,
        'entries': len(members), 'expandedBytes': total,
    }


def receipt(archive_path, commit, run):
    require(re.fullmatch(r'[1-9][0-9]*', run), 'Expected a GitHub run ID')
    with Path(archive_path).open('rb') as stream:
        archive, _, details = inspect_archive(stream, commit)
        archive.close()
    return {'format': 1, 'repository': REPOSITORY, 'workflow': 'cloudflare-staging.yml',
            'runId': run, **details}


def verify_extract(archive_path, receipt_path, commit, run, trusted_config, destination=None):
    require(Path(receipt_path).stat().st_size <= 65536, 'Oversized artifact receipt')
    record = json.loads(Path(receipt_path).read_text(encoding='utf-8'))
    require(isinstance(record, dict), 'Expected artifact receipt object')
    require(record.get('format') == 1 and record.get('repository') == REPOSITORY
            and record.get('workflow') == 'cloudflare-staging.yml' and record.get('runId') == run,
            'Receipt does not match the reviewed repository/workflow/run')
    require(re.fullmatch(r'[1-9][0-9]*', run), 'Expected a GitHub run ID')
    with Path(archive_path).open('rb') as stream:
        archive, members, details = inspect_archive(stream, commit)
        try:
            require(all(record.get(k) == v for k, v in details.items()), 'Artifact receipt mismatch')
            require(hashlib.sha256(Path(trusted_config).read_bytes().replace(b'\r\n', b'\n')).hexdigest() == details['configSha256'],
                    'Artifact config differs from the separately reviewed staging config')
            if destination is not None:
                if os.name == 'nt':
                    require(all(not re.search(r'[<>:"|?*\x00-\x1f]', part)
                                and not part.endswith(('.', ' '))
                                and not re.fullmatch(r'(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', part, re.I)
                                for member in members for part in PurePosixPath(member.name).parts),
                            'Use Linux extraction for platform-specific cache filenames')
                target = Path(destination).resolve()
                require(not target.exists(), 'Extraction destination must not already exist')
                # Validate everything before writing; never replace a checkout/build.
                target.mkdir(parents=False)
                for member in members:
                    path = target.joinpath(*PurePosixPath(member.name).parts)
                    require(path.resolve().is_relative_to(target), 'Extraction escaped its destination')
                    if member.isdir():
                        path.mkdir(parents=True, exist_ok=True)
                    else:
                        path.parent.mkdir(parents=True, exist_ok=True)
                        with archive.extractfile(member) as source, path.open('xb') as output:
                            while chunk := source.read(1024 * 1024):
                                output.write(chunk)
            return details
        finally:
            archive.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['receipt', 'verify', 'extract'])
    parser.add_argument('--archive', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--run', required=True)
    parser.add_argument('--receipt', required=True)
    parser.add_argument('--trusted-config')
    parser.add_argument('--destination')
    args = parser.parse_args()
    if args.action == 'receipt':
        record = receipt(args.archive, args.commit, args.run)
        with Path(args.receipt).open('x', encoding='utf-8') as output:
            json.dump(record, output, indent=2)
            output.write('\n')
        print('Recorded isolated staging artifact receipt')
    else:
        require(args.trusted_config, '--trusted-config is required')
        require(args.action != 'extract' or args.destination, '--destination is required')
        print(json.dumps(verify_extract(args.archive, args.receipt, args.commit, args.run,
                                       args.trusted_config, args.destination if args.action == 'extract' else None)))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, tarfile.TarError) as error:
        raise SystemExit(str(error))

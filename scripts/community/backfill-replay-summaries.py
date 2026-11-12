"""Backfill private replay summaries in bounded D1 queries after migration 0015.

Run from the repository root with an explicit database name. No archive contents or
identities leave D1. Interrupted runs resume by selecting only missing summaries.
"""
import argparse
import json
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database', choices=['arkpedia-prod-accounts', 'arkpedia-preview-accounts'])
    parser.add_argument('--batch-size', type=int, default=250, choices=range(1, 251), metavar='1..250')
    args = parser.parse_args()
    sql = Path(__file__).with_suffix('.sql').read_text().replace('LIMIT 250;', f'LIMIT {args.batch_size};')
    total = 0
    while True:
        result = subprocess.run([
            'npx', '--no-install', 'wrangler', 'd1', 'execute', args.database,
            '--remote', '--config', 'wrangler.jsonc', f'--command={sql}', '--json',
        ], text=True, capture_output=True, timeout=90)
        if result.returncode:
            raise RuntimeError(f"Backfill stopped safely; rerun to resume. {result.stderr[-1000:]} {result.stdout[-1000:]}")
        statements = json.loads(result.stdout)
        if not all(statement.get('success') for statement in statements):
            raise RuntimeError('Backfill failed; rerun to resume from the missing summaries.')
        written = sum(statement['meta']['changes'] for statement in statements)
        total += written
        print(f'Backfilled {total} summaries in this run; latest batch {written}.', flush=True)
        if not written:
            break


if __name__ == '__main__':
    main()

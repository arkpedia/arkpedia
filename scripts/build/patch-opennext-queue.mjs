// OpenNext 1.20.12 leaves AbortSignal.timeout's timer alive after a refresh.
// Use a cancellable timer so a completed refresh can hibernate immediately.
// Keep this patch narrow and fail on upstream changes; remove it when OpenNext
// provides the same cleanup. Both production and Preview compile this module.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const replacements = [
  [
    '        let response;\n        try {',
    `        let response;
        const timeoutController = new AbortController();
        const timeout = setTimeout(() => timeoutController.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError")), this.revalidationTimeout);
        try {`,
  ],
  [
    `                // This one is kind of problematic, it will always show the wall time of the revalidation to \`this.revalidationTimeout\`
                signal: AbortSignal.timeout(this.revalidationTimeout),`,
    '                signal: timeoutController.signal,',
  ],
  [
    '        finally {\n            this.ongoingRevalidations.delete(msg.MessageDeduplicationId);',
    '        finally {\n            clearTimeout(timeout);\n            this.ongoingRevalidations.delete(msg.MessageDeduplicationId);',
  ],
];

export function patchQueueSource(source) {
  const once = (part) => source.split(part).length === 2;
  if (replacements.every(([, after]) => once(after))) return source;
  if (!replacements.every(([before]) => once(before))) {
    throw new Error('OpenNext queue timeout patch no longer matches; review the upstream queue before building');
  }
  return replacements.reduce((result, [before, after]) => result.replace(before, after), source);
}

function main() {
  const require = createRequire(import.meta.url);
  const entry = require.resolve('@opennextjs/cloudflare');
  const { version } = JSON.parse(readFileSync(resolve(dirname(entry), '../../package.json'), 'utf8'));
  if (version !== '1.20.12') throw new Error(`Review the queue timeout patch for OpenNext ${version}`);
  const file = require.resolve('@opennextjs/cloudflare/durable-objects/queue');
  const source = readFileSync(file, 'utf8');
  const patched = patchQueueSource(source);
  if (patched !== source) writeFileSync(file, patched);
  console.log('OpenNext queue timeout cleanup verified');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

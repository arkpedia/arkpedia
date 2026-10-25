// Private staging publisher transport. No app binding, bucket creation or deletion.
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const POINTER = 'pilot-v1/channels/staging.json';
const keyLimit = key => key === POINTER ? 2048 : /^pilot-v1\/objects\/[a-f0-9]{64}$/.test(key) ? 25_000_000 : 0;
function etag(value) {
  const text = typeof value === 'string' ? value.replace(/^"(.*)"$/, '$1') : '';
  if (!/^[A-Za-z0-9-]{1,128}$/.test(text)) throw new Error('Invalid R2 ETag');
  return text;
}
function limitFor(key) {
  const limit = keyLimit(key);
  if (!limit) throw new Error('Only staging pilot object keys are allowed');
  return limit;
}

/** Explicit R2 credentials: never fall back to the caller's default AWS identity. */
export function createR2PilotClient({ accountId, accessKeyId, secretAccessKey }) {
  if (!/^[a-f0-9]{32}$/.test(accountId ?? '') || !/^[A-Za-z0-9]{16,128}$/.test(accessKeyId ?? '')
    || !/^[A-Za-z0-9+/=_-]{32,256}$/.test(secretAccessKey ?? '')) throw new Error('Explicit R2 account and S3 credentials are required');
  return new S3Client({
    region: 'auto', endpoint: `https://${accountId}.r2.cloudflarestorage.com`, forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    // A lost conditional-write response must be inspected, not silently replayed.
    maxAttempts: 1,
    requestHandler: { connectionTimeout: 10_000, requestTimeout: 120_000 },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

/** Implement the small native-R2 interface used by r2-snapshot through official S3 commands. */
export function r2S3Bucket({ client, bucketName }) {
  if (!client || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucketName ?? '')) throw new Error('An explicit R2 bucket and client are required');
  return {
    async get(key) {
      const limit = limitFor(key);
      let response;
      try { response = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: key })); }
      catch (error) {
        if (error.$metadata?.httpStatusCode === 404 && error.name === 'NoSuchKey') return null;
        throw new Error(`R2 read failed (HTTP ${error.$metadata?.httpStatusCode ?? 'network'})`);
      }
      try {
        const version = etag(response.ETag);
        if (response.ContentLength > limit || !response.Body?.[Symbol.asyncIterator]) throw new Error('Invalid or oversized R2 body');
        const chunks = [];
        let size = 0;
        for await (const chunk of response.Body) {
          const bytes = Buffer.from(chunk);
          size += bytes.length;
          if (size > limit) throw new Error('R2 body exceeds pilot limit');
          chunks.push(bytes);
        }
        const body = Buffer.concat(chunks);
        return { etag: version, size, text: async () => body.toString('utf8'),
          arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
      } catch (error) { response.Body?.destroy?.(); throw error; }
    },
    async put(key, value, { onlyIf } = {}) {
      const limit = limitFor(key);
      const body = Buffer.from(value);
      if (!body.length || body.length > limit) throw new Error('R2 upload exceeds pilot limit');
      if (key !== POINTER && onlyIf?.etagDoesNotMatch !== '*') throw new Error('Immutable delivery objects may only be created, never replaced');
      const command = { Bucket: bucketName, Key: key, Body: body, ContentLength: body.length };
      if (onlyIf && Object.keys(onlyIf).length === 1 && onlyIf.etagDoesNotMatch === '*') command.IfNoneMatch = '*';
      else if (onlyIf && Object.keys(onlyIf).length === 1 && typeof onlyIf.etagMatches === 'string') command.IfMatch = `"${etag(onlyIf.etagMatches)}"`;
      else throw new Error('An explicit R2 write precondition is required');
      try {
        const response = await client.send(new PutObjectCommand(command));
        return { etag: etag(response.ETag) };
      } catch (error) {
        if (error.$metadata?.httpStatusCode === 412) return null;
        // Do not echo service bodies or credential-bearing request objects.
        throw new Error(`R2 write failed (HTTP ${error.$metadata?.httpStatusCode ?? 'network'})`);
      }
    },
  };
}

/**
 * TEST ONLY (2026-10-22). Remove before the next release to main; it must not ride along in a
 * cherry-pick. It answers 404 everywhere except on a *.workers.dev address, which only the
 * Cloudflare Worker has: Vercel routes a request by its domain, so www and arkpedia-dev never
 * receive one for a workers.dev host.
 *
 * The question it answers: can Arkpedia's server confirm that an import's Yostar sign-in is real,
 * so the import could one day create a verified account? The browser sends the Yostar uid and
 * access token its import just used, once. This makes one call with them to the game's token
 * exchange (step 3, gameToken in lib/account-import/yostar.ts), the same call the import makes.
 * It answers only the verdict: whether the exchange accepted the pair, and whether the game uid
 * it names is the save's. Nothing is stored or logged, the token stays in the request body (never
 * the URL or a header), and the game token the exchange returns is dropped unread. With
 * `wrongUid`, the same token goes with the uid plus one. The exchange should refuse that, or name
 * the token's own account; naming another account would mean a uid can be claimed.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createPublicNetworkReader } from '@/lib/account-import/publicNetwork';
import { gameToken, ImportError, isServerId, parseNetwork, type Transport } from '@/lib/account-import/yostar';

export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };

const readNetwork = createPublicNetworkReader();
const DIGITS = /^\d{1,20}$/;
const TOKEN = /^[\x21-\x7e]{8,1024}$/;
const DEVICE = /^[\w-]{1,128}$/;

const fetchTransport: Transport = async (url, request) => {
  const response = await fetch(url, { method: request.method, headers: request.headers, body: request.body, signal: AbortSignal.timeout(15_000) });
  let json: unknown = null;
  try { json = await response.json(); } catch { /* not JSON: the caller reports the status */ }
  return { status: response.status, json };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!req.headers.host?.endsWith('.workers.dev')) return res.status(404).end();
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  if (!req.headers.host || req.headers.origin !== `https://${req.headers.host}`) return res.status(403).end();
  const { server, uid, token, deviceId, saveUid, wrongUid } = req.body ?? {};
  if (!isServerId(server) || typeof uid !== 'string' || !DIGITS.test(uid) || typeof token !== 'string' || !TOKEN.test(token)
    || typeof deviceId !== 'string' || !DEVICE.test(deviceId) || typeof saveUid !== 'string' || !DIGITS.test(saveUid)) return res.status(400).end();
  const check = wrongUid === true ? 'wrong-uid' : 'own-uid';
  const colo = String(req.headers['cf-ray'] ?? '').split('-')[1] ?? null;
  const started = Date.now();
  try {
    const network = parseNetwork(await readNetwork(server));
    const answer = await gameToken(fetchTransport, network, { uid: check === 'wrong-uid' ? String(BigInt(uid) + 1n) : uid, token }, deviceId);
    return res.status(200).json({
      check, server, colo, ms: Date.now() - started,
      accepted: answer.result === 0,
      result: typeof answer.result === 'number' ? answer.result : null,
      namesAGameUid: answer.uid != null,
      gameUidIsTheSaves: answer.uid != null && String(answer.uid) === saveUid,
    });
  } catch (error) {
    return res.status(200).json({ check, server, colo, ms: Date.now() - started, accepted: false, error: error instanceof ImportError ? error.message : 'the check could not be made' });
  }
}

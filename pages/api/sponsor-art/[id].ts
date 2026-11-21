import type { NextApiRequest, NextApiResponse } from 'next';
import { dashboardDatabase, dashboardEnv } from '@/lib/dashboard/access';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return void res.status(405).end();
  }

  const { id } = req.query;
  const db = dashboardDatabase(dashboardEnv());
  if (!db || typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) return void res.status(404).end();

  try {
    const artwork = await db.prepare('SELECT mime_type AS mimeType, bytes FROM campaign_editor_art WHERE id = ?')
      .bind(id).first<{ mimeType: string; bytes: number[] }>();
    if (!artwork) return void res.status(404).end();
    res.setHeader('Content-Type', artwork.mimeType);
    res.setHeader('Content-Length', artwork.bytes.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (req.method === 'HEAD') return void res.status(200).end();
    res.status(200).send(Buffer.from(artwork.bytes));
  } catch {
    return void res.status(503).end();
  }
}

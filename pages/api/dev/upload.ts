import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

// Matches the folder names your scrapers already use, so uploaded files
// resolve exactly like scraped ones do.
const ALLOWED_FOLDERS = ['event-posters', 'skin-images'];

function isLocalDev(): boolean {
  return process.env.NODE_ENV === 'development';
}

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } }, // images can be a few MB as base64
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isLocalDev()) {
    return res.status(403).json({ error: 'The dev console only works when running locally (npm run dev).' });
  }
  const passcode = process.env.DEV_CONSOLE_PASSCODE;
  if (passcode && req.headers['x-dev-passcode'] !== passcode) {
    return res.status(401).json({ error: 'Invalid passcode' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { folder, filename, dataBase64 } = req.body;
  if (!ALLOWED_FOLDERS.includes(folder)) {
    return res.status(400).json({ error: 'Unknown or disallowed folder', allowed: ALLOWED_FOLDERS });
  }
  if (!filename || !dataBase64) {
    return res.status(400).json({ error: 'Missing filename or dataBase64' });
  }

  const safeFilename = filename.replace(/[\\/*?:"<>|]/g, '').trim();
  const dir = path.join(process.cwd(), 'public', folder);
  const filepath = path.join(dir, safeFilename);

  try {
    fs.mkdirSync(dir, { recursive: true });
    const base64Data = dataBase64.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
    return res.status(200).json({ saved: true, path: `/${folder}/${safeFilename}` });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to save file', detail: String(e) });
  }
}
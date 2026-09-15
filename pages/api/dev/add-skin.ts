import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { Skin } from '@/lib/skins/skinTypes';

function isLocalDev(): boolean {
  return process.env.NODE_ENV === 'development';
}

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

  const { name, image, series, model, howToObtain } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Skin needs at least a name' });
  }

  const filepath = path.join(process.cwd(), 'data', 'skins.json');
  let skins: Skin[] = [];
  try {
    skins = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read skins.json', detail: String(e) });
  }

  if (skins.some((s) => s.name === name)) {
    return res.status(400).json({ error: `A skin named "${name}" already exists.` });
  }

  const newSkin: Skin = {
    name,
    series: series || 'Unreleased',
    seriesImage: null,
    code: null,
    model: model || null,
    illustrator: null,
    description: null,
    release: null,
    howToObtain: howToObtain || null,
    image: image || null,
  };

  skins.push(newSkin);

  try {
    fs.copyFileSync(filepath, filepath + '.bak');
    fs.writeFileSync(filepath, JSON.stringify(skins, null, 2), 'utf-8');
    return res.status(200).json({ saved: true, skin: newSkin });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to write skins.json', detail: String(e) });
  }
}
import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

// Only these files are editable -- an explicit allowlist, not just
// "anything in data/", so a malformed request can't read/write outside
// what's expected.
const ALLOWED_FILES = [
  'skins.json',
  'events/events_2020.json',
  'events/events_2021.json',
  'events/events_2022.json',
  'events/events_2023.json',
  'events/events_2024.json',
  'events/events_2025.json',
  'events/events_2026.json',
  'events/events_2027.json',
  'event_colors.json',
  'event_materials.json',
  'stage-guesser.json',
  'music-guesser-review.json',
  'techniques_definitions.json',
];

function isLocalDev(): boolean {
  return process.env.NODE_ENV === 'development';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Hard block outside local dev -- on Vercel's production servers, a
  // write here would either fail outright or vanish the moment the
  // serverless instance recycles, since the filesystem isn't persisted
  // back to your git repo. This tool only makes sense run locally.
  if (!isLocalDev()) {
    return res.status(403).json({
      error: 'The dev console only works when running locally (npm run dev). It cannot edit files on the deployed site.',
    });
  }

  const passcode = process.env.DEV_CONSOLE_PASSCODE;
  if (passcode && req.headers['x-dev-passcode'] !== passcode) {
    return res.status(401).json({ error: 'Invalid passcode' });
  }

  const filename = req.query.file as string;
  if (!filename || !ALLOWED_FILES.includes(filename)) {
    return res.status(400).json({ error: 'Unknown or disallowed file', allowed: ALLOWED_FILES });
  }

  const filepath = path.join(process.cwd(), 'data', filename);

  if (req.method === 'GET') {
    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      return res.status(200).json({ content });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to read file', detail: String(e) });
    }
  }

  if (req.method === 'POST') {
    const { content } = req.body;
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Missing "content" string in request body' });
    }

    // Validate it's real JSON before ever touching the file on disk --
    // a bad save should never be able to corrupt the file.
    try {
      JSON.parse(content);
    } catch (e) {
      return res.status(400).json({ error: 'Not valid JSON', detail: String(e) });
    }

    try {
      // Keep one backup of the previous version, overwritten each save --
      // a cheap safety net against an accidental bad edit.
      if (fs.existsSync(filepath)) {
        fs.copyFileSync(filepath, filepath + '.bak');
      }
      fs.writeFileSync(filepath, content, 'utf-8');
      return res.status(200).json({ saved: true });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to write file', detail: String(e) });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

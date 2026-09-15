import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { runWholeBaseOptimizer } from '@/lib/base/wholeBaseOptimizer';

function isLocalDev(): boolean {
  return process.env.NODE_ENV === 'development';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isLocalDev()) {
    return res.status(403).json({ error: 'The optimizer can only be re-run when running locally (npm run dev).' });
  }
  const passcode = process.env.DEV_CONSOLE_PASSCODE;
  if (passcode && req.headers['x-dev-passcode'] !== passcode) {
    return res.status(401).json({ error: 'Invalid passcode' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let results;
  try {
    const { balanced, total } = runWholeBaseOptimizer();
    results = { generatedAt: new Date().toISOString(), balanced, total };
  } catch (e) {
    return res.status(500).json({ error: 'Whole-base optimizer run failed', detail: String(e) });
  }

  const filepath = path.join(process.cwd(), 'data', 'whole-base-optimizer-results.json');
  try {
    if (fs.existsSync(filepath)) fs.copyFileSync(filepath, filepath + '.bak');
    fs.writeFileSync(filepath, JSON.stringify(results, null, 2), 'utf-8');
    return res.status(200).json({ saved: true, results });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to write whole-base-optimizer-results.json', detail: String(e) });
  }
}
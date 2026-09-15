import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const filepath = path.join(process.cwd(), 'data', 'whole-base-optimizer-results.json');
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    return res.status(200).json(JSON.parse(content));
  } catch (e) {
    return res.status(404).json({ error: 'No cached whole-base optimizer results yet. Run the optimizer locally first.' });
  }
}
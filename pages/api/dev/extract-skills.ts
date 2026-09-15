import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { Operator } from '@/lib/operators/operatorTypes';

function isLocalDev(): boolean {
  return process.env.NODE_ENV === 'development';
}

const RARITY_FOLDERS = [
  'operators-1star',
  'operators-2star',
  'operators-3star',
  'operators-4star',
  'operators-5star',
  'operators-6star',
];

function readOperatorFolder(dir: string): Operator[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return []; // folder might not exist yet -- skip rather than fail the whole request
  }
  const results: Operator[] = [];
  for (const f of files) {
    if (!f.toLowerCase().endsWith('.json')) continue;
    try {
      results.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')));
    } catch {
      continue; // one bad file shouldn't fail the whole request
    }
  }
  return results;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isLocalDev()) {
    return res.status(403).json({ error: 'The dev console only works when running locally (npm run dev).' });
  }
  const passcode = process.env.DEV_CONSOLE_PASSCODE;
  if (passcode && req.headers['x-dev-passcode'] !== passcode) {
    return res.status(401).json({ error: 'Invalid passcode' });
  }

  const facility = req.query.facility as string;
  if (!facility) {
    return res.status(400).json({ error: 'Missing facility query param. Use ?facility=list to see every facility value actually present in the data.' });
  }

  const dataDir = path.join(process.cwd(), 'data');

  if (facility === 'list') {
    const seen = new Set<string>();
    for (const folder of RARITY_FOLDERS) {
      for (const op of readOperatorFolder(path.join(dataDir, folder))) {
        for (const skill of op.baseSkills || []) {
          if (skill.facility) seen.add(skill.facility);
        }
      }
    }
    return res.status(200).json({ facilities: Array.from(seen).sort() });
  }

  const results: {
    operator: string;
    skillName: string | null;
    eliteLevel: string | null;
    description: string | null;
  }[] = [];

  for (const folder of RARITY_FOLDERS) {
    const operators = readOperatorFolder(path.join(dataDir, folder));

    for (const op of operators) {
      for (const skill of op.baseSkills || []) {
        if (skill.facility === facility) {
          results.push({
            operator: op.name,
            skillName: skill.name,
            eliteLevel: skill.eliteLevel,
            description: skill.description,
          });
        }
      }
    }
  }

  return res.status(200).json({ facility, count: results.length, skills: results });
}
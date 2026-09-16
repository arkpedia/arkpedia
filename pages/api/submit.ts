import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { pool } from '@/lib/server/db';
import { getOperators } from '@/lib/operators/getOperators';
import { Ratings, POWER_VALUES } from '@/lib/survey/types';

const MAX_SUBMISSIONS_PER_IP_PER_DAY = 5;
const VALID_POWERS = new Set(POWER_VALUES);

function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return (ip || req.socket.remoteAddress || 'unknown').trim();
}

function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || 'change-me-in-env';
  return crypto.createHash('sha256').update(ip + salt).digest('hex');
}

function isValidRatings(ratings: unknown, validNames: Set<string>): ratings is Ratings {
  if (!ratings || typeof ratings !== 'object') return false;
  const entries = Object.entries(ratings as Record<string, unknown>);

  // Every submitted operator must be a real, known operator name.
  for (const [name] of entries) {
    if (!validNames.has(name)) return false;
  }
  // Every known operator must be present (matches the client-side validation).
  for (const name of validNames) {
    if (!(name in (ratings as Record<string, unknown>))) return false;
  }

  for (const [, r] of entries) {
    if (!r || typeof r !== 'object') return false;
    const rating = r as { power: unknown; unrated: unknown };
    if (typeof rating.unrated !== 'boolean') return false;
    if (rating.unrated) {
      if (rating.power !== null) return false;
    } else {
      if (typeof rating.power !== 'number') return false;
      if (!VALID_POWERS.has(rating.power.toFixed(1))) return false;
    }
  }
  return true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Honeypot: real users never see or fill this field. If it's filled,
  // silently pretend success so bots don't learn to avoid it.
  if (typeof req.body?.hp === 'string' && req.body.hp.length > 0) {
    res.status(200).json({ ok: true });
    return;
  }

  const validNames = new Set(getOperators().map((op) => op.name));
  const ratings = req.body?.ratings;

  if (!isValidRatings(ratings, validNames)) {
    res.status(400).json({ error: 'Invalid submission' });
    return;
  }

  const ip = getClientIp(req);
  const ipHash = hashIp(ip);

  const client = await pool.connect();
  try {
    const recent = await client.query(
      `SELECT COUNT(*)::int AS n FROM submissions WHERE ip_hash = $1 AND created_at > now() - interval '24 hours'`,
      [ipHash]
    );
    if (recent.rows[0].n >= MAX_SUBMISSIONS_PER_IP_PER_DAY) {
      res.status(429).json({ error: 'Too many submissions from this network today. Please try again later.' });
      return;
    }

    await client.query('BEGIN');

    const subResult = await client.query(
      'INSERT INTO submissions (ip_hash) VALUES ($1) RETURNING id',
      [ipHash]
    );
    const submissionId = subResult.rows[0].id;

    for (const [name, r] of Object.entries(ratings)) {
      const unrated = !!r.unrated;
      const power = unrated ? null : r.power;
      await client.query(
        'INSERT INTO ratings (submission_id, operator_name, power, unrated) VALUES ($1, $2, $3, $4)',
        [submissionId, name, power, unrated]
      );
    }

    await client.query('COMMIT');
    res.status(200).json({ ok: true, submissionId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to save submission' });
  } finally {
    client.release();
  }
}
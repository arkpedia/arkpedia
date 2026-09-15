import type { NextApiRequest, NextApiResponse } from 'next';
import { runRotationExperiment, RotationExperimentResult } from '@/lib/base/baseRotationExperiment';

/** Local-development-only tool -- this computation is expensive
 * (multiple full combinatorial searches per scenario x pass x mode) and
 * was never meant for public/deployed use, only for the site owner's
 * own testing. Rejected outright outside development, regardless of
 * how the request arrives (button, direct fetch, curl, etc.) -- gating
 * only the button in the UI wouldn't stop someone who finds this URL
 * directly, so the real protection has to live here. */
export default function handler(req: NextApiRequest, res: NextApiResponse<RotationExperimentResult | { error: string }>) {
  if (process.env.NODE_ENV !== 'development') {
    res.status(404).json({ error: 'Not available.' });
    return;
  }
  const mode = req.query.mode === 'eliteTwo' ? 'eliteTwo' : 'eliteZero';
  try {
    const result = runRotationExperiment(mode);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error computing the rotation experiment.' });
  }
}
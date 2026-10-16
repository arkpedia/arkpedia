import type { NextApiRequest, NextApiResponse } from 'next';
import { devOnlyApi } from '@/lib/dev/devOnly';
import { writeOptimizerCache } from '@/lib/dev/optimizerCache';
import { runFullOptimizer } from '@/lib/base/optimizerLogic';

export default devOnlyApi(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let results;
  try {
    results = runFullOptimizer();
  } catch (e) {
    return res.status(500).json({ error: 'Optimizer run failed', detail: String(e) });
  }

  try {
    writeOptimizerCache('operator', results);
    return res.status(200).json({ saved: true, results });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to cache optimizer results', detail: String(e) });
  }
}, { passcode: 'writes' });

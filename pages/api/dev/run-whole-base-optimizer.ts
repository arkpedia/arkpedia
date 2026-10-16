import type { NextApiRequest, NextApiResponse } from 'next';
import { devOnlyApi } from '@/lib/dev/devOnly';
import { writeOptimizerCache } from '@/lib/dev/optimizerCache';
import { runWholeBaseOptimizer } from '@/lib/base/wholeBaseOptimizer';

export default devOnlyApi(async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  try {
    writeOptimizerCache('whole-base', results);
    return res.status(200).json({ saved: true, results });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to cache whole-base optimizer results', detail: String(e) });
  }
}, { passcode: 'writes' });

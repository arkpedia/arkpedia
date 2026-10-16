import { devOnlyApi } from '@/lib/dev/devOnly';
import { readOptimizerCache } from '@/lib/dev/optimizerCache';

export default devOnlyApi(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    return res.status(200).json(readOptimizerCache('whole-base'));
  } catch {
    return res.status(404).json({ error: 'No cached optimizer results yet. Run the optimizer locally first.' });
  }
}, { passcode: 'writes' });

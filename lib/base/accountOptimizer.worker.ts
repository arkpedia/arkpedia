import { optimizeAccountBase, type AccountOptimizerInput } from './accountOptimizer';
self.onmessage = (event: MessageEvent<AccountOptimizerInput>) => {
  try {
    const result = optimizeAccountBase(event.data, (done, total, label) => self.postMessage({ progress: { done, total, label } }));
    self.postMessage({ result });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Could not optimize this account.' }); }
};

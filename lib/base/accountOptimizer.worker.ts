import { optimizeAccountBase, type AccountOptimizerInput } from './accountOptimizer';
self.onmessage = (event: MessageEvent<AccountOptimizerInput>) => {
  try {
    // `partial` is the best result so far: the page keeps it, so stopping the search still leaves a plan.
    const result = optimizeAccountBase(event.data, (done, total, label, best) => self.postMessage({ progress: { done, total, label }, ...(best ? { partial: best } : {}) }));
    self.postMessage({ result });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Could not optimize this account.' }); }
};

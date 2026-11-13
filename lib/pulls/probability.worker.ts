import { calculateOdds } from './exactProbability';
import type { OddsRequest } from './probability';
self.onmessage = (event: MessageEvent<OddsRequest>) => {
  try { self.postMessage({ result: calculateOdds(event.data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Could not calculate chances.' }); }
};

import { simulateOdds, type OddsRequest } from './probability';
self.onmessage = (event: MessageEvent<OddsRequest>) => {
  try { self.postMessage({ result: simulateOdds(event.data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Could not calculate chances.' }); }
};

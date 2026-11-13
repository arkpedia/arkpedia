// Apply the same account ingress protection on canonical and direct Worker requests.
import { protectPreviewRequest } from './preview-security.mjs';
import { refreshDailyServices } from './daily-refresh.mjs';
import app from '../../.open-next/worker.js';
export { DOQueueHandler } from '../../.open-next/worker.js';

export default {
  async scheduled(_event, env) {
    await refreshDailyServices(env);
  },
  fetch(request, env, ctx) {
    return protectPreviewRequest(request, env, () => app.fetch(request, env, ctx));
  },
};

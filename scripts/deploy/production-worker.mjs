// Apply the same account ingress protection on canonical and direct Worker requests.
import { protectPreviewRequest } from './preview-security.mjs';
import app from '../../.open-next/worker.js';
export { DOQueueHandler } from '../../.open-next/worker.js';

export default {
  fetch(request, env, ctx) {
    return protectPreviewRequest(request, env, () => app.fetch(request, env, ctx));
  },
};

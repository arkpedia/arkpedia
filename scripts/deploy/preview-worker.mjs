// Keep OpenNext self-calls within the current native Preview. A service binding
// would send revalidation to the live Worker instead.
import { WorkerEntrypoint } from 'cloudflare:workers';
import app, { DOQueueHandler as OpenNextQueue } from '../../.open-next/worker.js';

function isolatedEnv(env, ctx) {
  return { ...env, WORKER_SELF_REFERENCE: ctx.exports.PreviewSelf };
}

export class PreviewSelf extends WorkerEntrypoint {
  fetch(request) {
    return app.fetch(request, isolatedEnv(this.env, this.ctx), this.ctx);
  }
}

export class DOQueueHandler extends OpenNextQueue {
  constructor(ctx, env) {
    super(ctx, isolatedEnv(env, ctx));
  }
}

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, isolatedEnv(env, ctx), ctx);
  },
};

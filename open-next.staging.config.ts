import productionConfig from './open-next.config';

// cloudflare-staging.mjs supplies ARKPEDIA_WORKER and the channel through the
// environment, so this command also works with Windows' default command shell.
const config = { ...productionConfig, buildCommand: 'npm run build' };
export default config;

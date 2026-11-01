import { createReplayHandler } from '@/lib/cloud-account/replays-api';
export const config = { api: { bodyParser: { sizeLimit: '1100kb' } } };
export default createReplayHandler();

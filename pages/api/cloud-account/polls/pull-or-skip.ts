import { createCommunityHandler } from '@/lib/community/api';
export default createCommunityHandler('pull-poll');
export const config = { api: { bodyParser: { sizeLimit: '64kb' } } };

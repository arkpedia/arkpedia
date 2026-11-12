import { createCommunityHandler } from '@/lib/community/api';
export const config = { api: { bodyParser: { sizeLimit: '2kb' } } };
export default createCommunityHandler('availability');

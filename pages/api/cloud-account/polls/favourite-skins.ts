import { createCommunityHandler } from '@/lib/community/api';
export default createCommunityHandler('skin-poll');
export const config={api:{bodyParser:{sizeLimit:'8kb'}}};

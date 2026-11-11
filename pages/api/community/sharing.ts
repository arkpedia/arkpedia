import { createCommunityHandler } from '@/lib/community/api';
export const config={api:{bodyParser:{sizeLimit:'300kb'}}};
export default createCommunityHandler('sharing');

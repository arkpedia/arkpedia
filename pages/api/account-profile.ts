import { createAccountProfileHandler } from '@/lib/cloud-account/profile-api';

export const config = { api: { bodyParser: { sizeLimit: '4kb' } } };
export default createAccountProfileHandler();

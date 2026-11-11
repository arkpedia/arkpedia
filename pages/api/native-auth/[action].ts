import { createNativeAuthHandler } from '@/lib/cloud-account/native-auth';
export const config = { api: { bodyParser: { sizeLimit: '4kb' } } };
export default createNativeAuthHandler();

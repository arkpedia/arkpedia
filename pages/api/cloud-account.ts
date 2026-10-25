import { createCloudAccountHandler } from '@/lib/cloud-account/api';

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };
export default createCloudAccountHandler();

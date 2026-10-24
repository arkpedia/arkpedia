import { createCloudAccountHandler } from '@/lib/cloud-account/api';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };
export default createCloudAccountHandler();

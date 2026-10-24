import { createAuthClient } from 'better-auth/react';

// The SDK builds /api/auth/sign-in/social, /api/auth/get-session and linking URLs.
export const accountClient = createAuthClient({ basePath: '/api/auth' });

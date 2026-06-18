/**
 * Module augmentation for next-auth — adds Construction OS identity claims
 * (role, tenantId) and the backend-issued tokens to the session/JWT.
 */
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    error?: string;
    user?: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;
      tenantId?: string;
    };
  }

  interface User {
    accessToken: string;
    refreshToken: string;
    role: string;
    tenantId: string;
    accessTokenExpires: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
    userId?: string;
    role?: string;
    tenantId?: string;
    accessTokenExpires?: number;
    error?: string;
  }
}

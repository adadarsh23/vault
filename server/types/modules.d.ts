/**
 * Ambient Module Declarations & Node.js Environment Types
 */

declare module 'compression';
declare module 'morgan';
declare module 'sharp';

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV?: 'development' | 'production' | 'test';
      PORT?: string;
      HOST?: string;
      JWT_SECRET?: string;
      JWT_EXPIRES_IN?: string;
      REFRESH_TOKEN_SECRET?: string;
      REFRESH_TOKEN_EXPIRES_IN?: string;
      MONGODB_URI?: string;
      MONGODB_URL?: string;
      MONGO_URI?: string;
      MONGO_URL?: string;
      CLIENT_URL?: string;
      PUBLIC_URL?: string;
      VITE_APP_PUBLIC_URL?: string;
      RECAPTCHA_SECRET_KEY?: string;
      VAULT_ENCRYPTION_KEY?: string;
      AUTH_PEPPER?: string;
      CSRF_SECRET?: string;
      SIGNED_URL_SECRET?: string;
      SKIP_MONGO_CONNECT?: string;
      SKIP_RECAPTCHA?: string;
      MAX_FILE_SIZE_MB?: string;
      MAX_ACTIVITY_LOGS?: string;
      MAX_LOGIN_HISTORY?: string;
      MAX_ACTIVE_DEVICES?: string;
    }
  }
}

export {};

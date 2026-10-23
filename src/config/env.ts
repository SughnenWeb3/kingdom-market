import 'dotenv/config';

import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  FRONTEND_URL: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1).optional(),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  SESSION_COOKIE_NAME: z.string().min(1).default('km_session'),
  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().min(1).default(30),
  SESSION_ABSOLUTE_TIMEOUT_DAYS: z.coerce.number().int().min(1).default(7),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).default(12),
  CSRF_SECRET: z.string().min(32).optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.url().optional(),
  CLOUDINARY_UPLOAD_PRESET: z.string().min(1).default('km_signed'),
  CLOUDINARY_UPLOAD_FOLDER_ROOT: z.string().min(1).default('km'),
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  // These deliberately have no defaults: they must mirror the signed preset.
  CLOUDINARY_MAX_FILE_BYTES: z.coerce.number().int().positive(),
  CLOUDINARY_MAX_WIDTH: z.coerce.number().int().positive(),
  CLOUDINARY_MAX_HEIGHT: z.coerce.number().int().positive(),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const issues = parsedEnvironment.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = parsedEnvironment.data;

export const requireCloudinaryConfig = (): Pick<typeof env,
  'CLOUDINARY_CLOUD_NAME' | 'CLOUDINARY_API_KEY' | 'CLOUDINARY_API_SECRET' |
  'CLOUDINARY_MAX_FILE_BYTES' | 'CLOUDINARY_MAX_WIDTH' | 'CLOUDINARY_MAX_HEIGHT'> => {
  return {
    CLOUDINARY_CLOUD_NAME: env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: env.CLOUDINARY_API_SECRET,
    CLOUDINARY_MAX_FILE_BYTES: env.CLOUDINARY_MAX_FILE_BYTES,
    CLOUDINARY_MAX_WIDTH: env.CLOUDINARY_MAX_WIDTH,
    CLOUDINARY_MAX_HEIGHT: env.CLOUDINARY_MAX_HEIGHT,
  };
};

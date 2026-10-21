import 'dotenv/config';

import { defineConfig } from 'prisma/config';

// Use process.env directly instead of the env() helper so that commands like
// `prisma generate` work in CI environments where DATABASE_URL is not set.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});

import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

import { env } from '../config/env.js';

const connectionString = env.NODE_ENV === 'test' ? env.TEST_DATABASE_URL : env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    env.NODE_ENV === 'test'
      ? 'TEST_DATABASE_URL is required in test mode'
      : 'DATABASE_URL is required',
  );
}

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

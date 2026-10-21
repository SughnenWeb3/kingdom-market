import 'dotenv/config';

// Ensure test mode so the Prisma client uses TEST_DATABASE_URL.
process.env.NODE_ENV = 'test';

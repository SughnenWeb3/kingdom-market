import 'dotenv/config';

// Ensure test mode so the Prisma client uses TEST_DATABASE_URL.
process.env.NODE_ENV = 'test';
process.env.CLOUDINARY_CLOUD_NAME ??= 'test-cloud';
process.env.CLOUDINARY_API_KEY ??= 'test-key';
process.env.CLOUDINARY_API_SECRET ??= 'test-secret';
process.env.CLOUDINARY_MAX_FILE_BYTES ??= '1000000';
process.env.CLOUDINARY_MAX_WIDTH ??= '2000';
process.env.CLOUDINARY_MAX_HEIGHT ??= '2000';

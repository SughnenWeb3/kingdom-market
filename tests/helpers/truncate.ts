import { prisma } from '../../src/lib/prisma.js';

// Truncate all tables in the test database between test files.
// Uses TRUNCATE ... RESTART IDENTITY CASCADE to wipe all data and reset sequences.
const TABLES = [
  'ListingPhoto',
  'ServiceArea',
  'Listing',
  'PhoneChangeRequest',
  'CategorySuggestion',
  'Session',
  'OAuthAccount',
  'ProviderCategory',
  'ProviderProfile',
  'Category',
  'User',
] as const;

export async function truncateAll(): Promise<void> {
  // Prisma parameterizes identifiers, but TRUNCATE needs raw table names.
  // Since these are hardcoded constants (not user input), raw SQL is safe here.
  const tableList = TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tableList} RESTART IDENTITY CASCADE;`,
  );
}

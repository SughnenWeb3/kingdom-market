import { prisma } from '../../lib/prisma.js';

export const getLiveStatus = (): { status: 'ok' } => ({ status: 'ok' });

// Readiness checks the database with SELECT 1.
// Returns "unavailable" (not an error) so the route can send 503 without triggering the error handler.
export const getReadyStatus = async (): Promise<{ status: 'ready' | 'unavailable' }> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ready' };
  } catch {
    return { status: 'unavailable' };
  }
};

export const getLiveStatus = (): { status: 'ok' } => ({ status: 'ok' });

// Readiness is intentionally independent of the database until Prisma is introduced in Phase 2.
export const getReadyStatus = (): { status: 'ready' } => ({ status: 'ready' });

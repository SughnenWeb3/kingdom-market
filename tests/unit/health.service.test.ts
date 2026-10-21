import { describe, expect, it, vi } from 'vitest';

import { getLiveStatus, getReadyStatus } from '../../src/modules/health/health.service.js';

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  },
}));

describe('health service', () => {
  it('reports that the process is live', () => {
    expect(getLiveStatus()).toEqual({ status: 'ok' });
  });

  it('reports ready when the database responds', async () => {
    expect(await getReadyStatus()).toEqual({ status: 'ready' });
  });
});

import { describe, expect, it } from 'vitest';

import { getLiveStatus, getReadyStatus } from '../../src/modules/health/health.service.js';

describe('health service', () => {
  it('reports that the process is live', () => {
    expect(getLiveStatus()).toEqual({ status: 'ok' });
  });

  it('reports ready before database readiness is introduced', () => {
    expect(getReadyStatus()).toEqual({ status: 'ready' });
  });
});

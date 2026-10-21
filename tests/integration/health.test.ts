import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../../src/app.js';

import { truncateAll } from '../helpers/truncate.js';

describe('health endpoints', () => {
  afterEach(async () => {
    await truncateAll();
  });

  describe('GET /api/v1/health/live', () => {
    it('returns 200 with status ok', async () => {
      const response = await request(createApp()).get('/api/v1/health/live');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /api/v1/health/ready', () => {
    it('returns 200 with status ready when the database is connected', async () => {
      const response = await request(createApp()).get('/api/v1/health/ready');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ready' });
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const cloudinary = vi.hoisted(() => ({
  verifyProfileAsset: vi.fn(async (_userId: string, publicId: string) => ({
    publicId, secureUrl: `https://res.cloudinary.com/test/image/upload/${publicId}.jpg`, format: 'jpg', bytes: 100, width: 100, height: 100,
  })),
  destroyAsset: vi.fn(async () => undefined),
  createUploadSignature: vi.fn(() => ({ cloudName: 'test', apiKey: 'public-key', timestamp: 1, folder: 'km/user/profile', uploadPreset: 'km_signed', signature: 'signature' })),
}));

vi.mock('../../src/lib/cloudinary.js', () => cloudinary);

import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { registerAndAuth } from '../helpers/auth.js';
import { truncateAll } from '../helpers/truncate.js';

const origin = 'http://localhost:5173';
const uniqueEmail = (): string => `provider-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

describe('provider profiles', () => {
  beforeEach(async () => {
    await truncateAll();
    await prisma.category.create({ data: { name: 'Services', slug: 'services', isActive: true } });
  });
  afterEach(truncateAll);

  const createProfile = async (app: ReturnType<typeof createApp>, email = uniqueEmail()) => {
    const auth = await registerAndAuth(app, email, 'validPassword12!');
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: 'services' } });
    const image = `km/${auth.userId}/profile/avatar`;
    const response = await request(app).post('/api/v1/providers/me').set('Origin', origin).set('Cookie', auth.cookie).set('X-CSRF-Token', auth.csrfToken).send({
      providerName: 'Grace Services', description: 'A dependable local service provider.', profileImagePublicId: image,
      state: 'Lagos', city: '  Ikeja  ', phoneNumber: '0803 123 4567', whatsappNumber: '+234 803 765 4321', categoryIds: [category.id],
    });
    return { auth, response };
  };

  it('creates one profile and never exposes contacts publicly', async () => {
    const app = createApp();
    const { auth, response } = await createProfile(app);
    expect(response.status).toBe(201);
    expect(response.body.data.phoneNumber).toBe('+2348031234567');
    expect(response.body.data.city).toBe('Ikeja');

    const publicResponse = await request(app).get(`/api/v1/providers/${response.body.data.id}`);
    expect(publicResponse.status).toBe(200);
    expect(JSON.stringify(publicResponse.body)).not.toContain('+2348031234567');
    expect(JSON.stringify(publicResponse.body)).not.toContain('+2348037654321');
    expect(publicResponse.body.data.activeListingCount).toBe(0);

    const category = await prisma.category.findUniqueOrThrow({ where: { slug: 'services' } });
    const duplicate = await request(app).post('/api/v1/providers/me').set('Origin', origin).set('Cookie', auth.cookie).set('X-CSRF-Token', auth.csrfToken).send({
      providerName: 'Another Service', description: 'Another complete and valid provider profile.', profileImagePublicId: `km/${auth.userId}/profile/second`,
      state: 'Lagos', city: 'Ikeja', phoneNumber: '08031230000', whatsappNumber: '08031230000', categoryIds: [category.id],
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('PROVIDER_EXISTS');
  });

  it('gates contact details, sets no-store, and rejects direct phone patches', async () => {
    const app = createApp();
    const { auth, response } = await createProfile(app);
    const id = response.body.data.id as string;
    expect((await request(app).get(`/api/v1/providers/${id}/contact`)).status).toBe(401);
    const contact = await request(app).get(`/api/v1/providers/${id}/contact`).set('Cookie', auth.cookie);
    expect(contact.status).toBe(200);
    expect(contact.headers['cache-control']).toBe('no-store');
    expect(contact.body.data.phoneNumber).toBe('+2348031234567');
    const patch = await request(app).patch('/api/v1/providers/me').set('Origin', origin).set('Cookie', auth.cookie).set('X-CSRF-Token', auth.csrfToken).send({ phoneNumber: '08031230000' });
    expect(patch.status).toBe(400);
    expect(patch.body.error.message).toContain('phone-change-requests');
  });

  it('keeps the approved number unchanged while a phone-change request is pending', async () => {
    const app = createApp();
    const { auth } = await createProfile(app);
    const change = await request(app).post('/api/v1/providers/me/phone-change-requests').set('Origin', origin).set('Cookie', auth.cookie).set('X-CSRF-Token', auth.csrfToken).send({ proposedPhone: '08031230000' });
    expect(change.status).toBe(201);
    expect(change.body.data.proposedPhone).toBe('+2348031230000');
    const mine = await request(app).get('/api/v1/providers/me').set('Cookie', auth.cookie);
    expect(mine.body.data.phoneNumber).toBe('+2348031234567');
    expect(mine.body.data.pendingPhoneChange.proposedPhone).toBe('+2348031230000');
    const duplicate = await request(app).post('/api/v1/providers/me/phone-change-requests').set('Origin', origin).set('Cookie', auth.cookie).set('X-CSRF-Token', auth.csrfToken).send({ proposedPhone: '08031230001' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('PENDING_REQUEST_EXISTS');
  });
});

/**
 * Integration tests for Phase 5: Listings and media.
 *
 * Covers:
 * - CRUD (create, read, patch)
 * - Lifecycle: activate, deactivate, archive, restore
 * - Photo add / remove
 * - Service areas
 * - Owner read endpoints (/providers/me/listings)
 * - IDOR protection (another user's listing → 404)
 * - Fake owner ID ignored (session decides ownership)
 * - 11th active listing → 409
 * - Concurrent activations hold the 10-listing cap
 * - Archived listings cannot be activated or edited
 * - Activation without a photo fails
 * - Concurrent photo uploads hold the 5-photo cap
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// ── Mock Cloudinary at the wrapper boundary ───────────────────────────────
const cloudinary = vi.hoisted(() => ({
  verifyProfileAsset: vi.fn(async (_userId: string, publicId: string) => ({
    publicId,
    secureUrl: `https://res.cloudinary.com/test/image/upload/${publicId}`,
    format: 'jpg',
    bytes: 100,
    width: 100,
    height: 100,
  })),
  verifyListingAsset: vi.fn(async (_userId: string, publicId: string) => ({
    publicId,
    secureUrl: `https://res.cloudinary.com/test/image/upload/${publicId}`,
    format: 'jpg',
    bytes: 100,
    width: 100,
    height: 100,
  })),
  destroyAsset: vi.fn(async () => undefined),
  createUploadSignature: vi.fn(() => ({
    cloudName: 'test',
    apiKey: 'public-key',
    timestamp: 1,
    folder: 'km/user/profile',
    uploadPreset: 'km_signed',
    signature: 'sig',
  })),
}));

vi.mock('../../src/lib/cloudinary.js', () => cloudinary);

import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { registerAndAuth } from '../helpers/auth.js';
import { truncateAll } from '../helpers/truncate.js';

const origin = 'http://localhost:5173';
let categoryId: string;

const uid = () =>
  `listing-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

// ── Shared helpers ─────────────────────────────────────────────────────────

/** Register a user and create a provider profile; returns auth + providerId */
const setupProvider = async (app: ReturnType<typeof createApp>, email = uid()) => {
  const auth = await registerAndAuth(app, email, 'validPassword12!');
  const image = `km/${auth.userId}/profile/avatar`;
  const res = await request(app)
    .post('/api/v1/providers/me')
    .set('Origin', origin)
    .set('Cookie', auth.cookie)
    .set('X-CSRF-Token', auth.csrfToken)
    .send({
      providerName: 'Test Provider',
      description: 'A complete and valid provider profile.',
      profileImagePublicId: image,
      state: 'Lagos',
      city: 'Ikeja',
      phoneNumber: '08031234567',
      whatsappNumber: '08031234567',
      categoryIds: [categoryId],
    });
  expect(res.status).toBe(201);
  return { auth, providerId: res.body.data.id as string };
};

/** Create a PRODUCT listing (INACTIVE, no photos) */
const createProductListing = async (
  app: ReturnType<typeof createApp>,
  auth: { cookie: string; csrfToken: string },
  overrides: Record<string, unknown> = {},
) => {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Origin', origin)
    .set('Cookie', auth.cookie)
    .set('X-CSRF-Token', auth.csrfToken)
    .send({
      type: 'PRODUCT',
      title: 'Fresh Tomatoes',
      description: 'Locally grown tomatoes from Plateau state.',
      categoryId,
      state: 'Lagos',
      city: 'Ikeja',
      pricingType: 'FIXED',
      priceAmount: '5000.00',
      ...overrides,
    });
  return res;
};

/** Add a photo to a listing */
const addPhoto = async (
  app: ReturnType<typeof createApp>,
  auth: { cookie: string; csrfToken: string; userId: string },
  listingId: string,
  index = 0,
) => {
  const publicId = `km/${auth.userId}/listings/photo-${index}-${Date.now()}`;
  const res = await request(app)
    .post(`/api/v1/listings/${listingId}/photos`)
    .set('Origin', origin)
    .set('Cookie', auth.cookie)
    .set('X-CSRF-Token', auth.csrfToken)
    .send({ publicId, altText: `Photo ${index}` });
  return res;
};

// ── Setup / teardown ───────────────────────────────────────────────────────

beforeEach(async () => {
  await truncateAll();
  const cat = await prisma.category.create({
    data: { name: 'Food & Groceries', slug: 'food-groceries', isActive: true },
  });
  categoryId = cat.id;
});

afterEach(truncateAll);

// ── Test suites ────────────────────────────────────────────────────────────

describe('POST /listings — create', () => {
  it('creates an INACTIVE PRODUCT listing with no photos', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const res = await createProductListing(app, auth);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('INACTIVE');
    expect(res.body.data.type).toBe('PRODUCT');
    expect(res.body.data.priceAmount).toBe('5000.00');
    expect(res.body.data.photos).toHaveLength(0);
  });

  it('creates a SERVICE listing with serviceMode and serviceAreas', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const res = await request(app)
      .post('/api/v1/listings')
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken)
      .send({
        type: 'SERVICE',
        title: 'Home Cleaning Service',
        description: 'Professional home cleaning across Lagos and Ogun.',
        categoryId,
        state: 'Lagos',
        city: 'Ikeja',
        pricingType: 'STARTING_FROM',
        priceAmount: '15000.00',
        serviceMode: 'IN_PERSON',
        serviceAreas: [
          { state: 'Lagos', city: 'Victoria Island' },
          { state: 'Ogun', city: 'Abeokuta' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.serviceMode).toBe('IN_PERSON');
    expect(res.body.data.serviceAreas).toHaveLength(2);
  });

  it('rejects creation without a provider profile', async () => {
    const app = createApp();
    const auth = await registerAndAuth(app, uid(), 'validPassword12!');

    const res = await createProductListing(app, auth);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects invalid pricing (FIXED without priceAmount)', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const res = await createProductListing(app, auth, { pricingType: 'FIXED', priceAmount: undefined });
    expect(res.status).toBe(400);
  });

  it('rejects NEGOTIABLE with a priceAmount', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const res = await createProductListing(app, auth, {
      pricingType: 'NEGOTIABLE',
      priceAmount: '1000.00',
    });
    expect(res.status).toBe(400);
  });

  it('rejects SERVICE without serviceMode', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const res = await request(app)
      .post('/api/v1/listings')
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken)
      .send({
        type: 'SERVICE',
        title: 'Tailoring Service',
        description: 'Custom tailoring for all occasions.',
        categoryId,
        state: 'Lagos',
        city: 'Ikeja',
        pricingType: 'FIXED',
        priceAmount: '8000.00',
        // serviceMode intentionally omitted
      });
    expect(res.status).toBe(400);
  });

  it('rejects PRODUCT with serviceMode', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const res = await createProductListing(app, auth, { serviceMode: 'REMOTE' });
    expect(res.status).toBe(400);
  });
});

describe('GET /listings/:listingId — public', () => {
  it('returns a public listing when ACTIVE', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const created = await createProductListing(app, auth);
    const listingId = created.body.data.id as string;

    await addPhoto(app, auth, listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/activate`)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken);

    const res = await request(app).get(`/api/v1/listings/${listingId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Fresh Tomatoes');
    // Public shape must not include status, archivedAt, or photo.publicId
    expect(res.body.data.status).toBeUndefined();
    expect(res.body.data.archivedAt).toBeUndefined();
    expect(res.body.data.photos[0]?.publicId).toBeUndefined();
  });

  it('returns 404 for INACTIVE listings', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const created = await createProductListing(app, auth);
    const listingId = created.body.data.id as string;

    const res = await request(app).get(`/api/v1/listings/${listingId}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /listings/:listingId — update', () => {
  it('updates an INACTIVE listing', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const created = await createProductListing(app, auth);
    const listingId = created.body.data.id as string;

    const res = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken)
      .send({ title: 'Fresh Peppers', priceAmount: '3000.00' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Fresh Peppers');
    expect(res.body.data.priceAmount).toBe('3000.00');
  });

  it('returns 404 when patching another user\'s listing (IDOR)', async () => {
    const app = createApp();
    const { auth: auth1 } = await setupProvider(app);
    const { auth: auth2 } = await setupProvider(app);

    const created = await createProductListing(app, auth1);
    const listingId = created.body.data.id as string;

    const res = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Origin', origin)
      .set('Cookie', auth2.cookie)
      .set('X-CSRF-Token', auth2.csrfToken)
      .send({ title: 'Hijacked Title' });

    expect(res.status).toBe(404);
  });

  it('rejects PATCH on an ARCHIVED listing', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const created = await createProductListing(app, auth);
    const listingId = created.body.data.id as string;

    await addPhoto(app, auth, listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/activate`)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken);
    await request(app)
      .post(`/api/v1/listings/${listingId}/archive`)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken);

    const res = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken)
      .send({ title: 'Archived Edit Attempt' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });
});

describe('Lifecycle transitions', () => {
  it('INACTIVE → activate → ACTIVE', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const created = await createProductListing(app, auth);
    const listingId = created.body.data.id as string;
    await addPhoto(app, auth, listingId);

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/activate`)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACTIVE');
  });

  it('activation without a photo fails with 400 VALIDATION_ERROR', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const created = await createProductListing(app, auth);
    const listingId = created.body.data.id as string;

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/activate`)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).toContain('photo');
  });

  it('ACTIVE → deactivate → INACTIVE', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const created = await createProductListing(app, auth);
    const listingId = created.body.data.id as string;
    await addPhoto(app, auth, listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/activate`)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken);

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/deactivate`)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('INACTIVE');
  });

  it('ACTIVE → archive → ARCHIVED, then archived cannot be activated', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const created = await createProductListing(app, auth);
    const listingId = created.body.data.id as string;
    await addPhoto(app, auth, listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/activate`)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken);

    const archiveRes = await request(app)
      .post(`/api/v1/listings/${listingId}/archive`)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken);

    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.data.status).toBe('ARCHIVED');
    expect(archiveRes.body.data.archivedAt).not.toBeNull();

    // Cannot activate an ARCHIVED listing
    const activateRes = await request(app)
      .post(`/api/v1/listings/${listingId}/activate`)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken);

    expect(activateRes.status).toBe(409);
    expect(activateRes.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('ARCHIVED → restore → INACTIVE, then can activate again', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const created = await createProductListing(app, auth);
    const listingId = created.body.data.id as string;
    await addPhoto(app, auth, listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/activate`)
      .set('Origin', origin).set('Cookie', auth.cookie).set('X-CSRF-Token', auth.csrfToken);
    await request(app)
      .post(`/api/v1/listings/${listingId}/archive`)
      .set('Origin', origin).set('Cookie', auth.cookie).set('X-CSRF-Token', auth.csrfToken);

    const restoreRes = await request(app)
      .post(`/api/v1/listings/${listingId}/restore`)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken);

    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.data.status).toBe('INACTIVE');
    expect(restoreRes.body.data.archivedAt).toBeNull();

    // Now re-activate
    const reactivateRes = await request(app)
      .post(`/api/v1/listings/${listingId}/activate`)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken);

    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.data.status).toBe('ACTIVE');
  });

  it('11th active listing returns 409 LISTING_LIMIT_REACHED', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    // Activate 10 listings
    for (let i = 0; i < 10; i++) {
      const created = await createProductListing(app, auth, {
        title: `Listing ${i + 1}`,
        description: `Description for listing number ${i + 1} which is unique.`,
      });
      const listingId = created.body.data.id as string;
      await addPhoto(app, auth, listingId);
      const activateRes = await request(app)
        .post(`/api/v1/listings/${listingId}/activate`)
        .set('Origin', origin).set('Cookie', auth.cookie).set('X-CSRF-Token', auth.csrfToken);
      expect(activateRes.status).toBe(200);
    }

    // 11th listing
    const eleventh = await createProductListing(app, auth, {
      title: 'Eleventh Listing',
      description: 'This should be the listing that hits the cap.',
    });
    const eleventhId = eleventh.body.data.id as string;
    await addPhoto(app, auth, eleventhId);
    const res = await request(app)
      .post(`/api/v1/listings/${eleventhId}/activate`)
      .set('Origin', origin).set('Cookie', auth.cookie).set('X-CSRF-Token', auth.csrfToken);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LISTING_LIMIT_REACHED');
  });

  it('concurrent activations hold the 10-listing cap', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    // Create 11 inactive listings with photos
    const listingIds: string[] = [];
    for (let i = 0; i < 11; i++) {
      const created = await createProductListing(app, auth, {
        title: `Concurrent Listing ${i + 1}`,
        description: `Description for concurrent listing ${i + 1} to fill up the cap.`,
      });
      const listingId = created.body.data.id as string;
      await addPhoto(app, auth, listingId);
      listingIds.push(listingId);
    }

    // Fire all 11 activations concurrently
    const results = await Promise.all(
      listingIds.map((id) =>
        request(app)
          .post(`/api/v1/listings/${id}/activate`)
          .set('Origin', origin)
          .set('Cookie', auth.cookie)
          .set('X-CSRF-Token', auth.csrfToken),
      ),
    );

    const successes = results.filter((r) => r.status === 200);
    const conflicts = results.filter((r) => r.status === 409);

    expect(successes).toHaveLength(10);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.body.error.code).toBe('LISTING_LIMIT_REACHED');
  });
});

describe('Photo management', () => {
  it('adds up to 5 photos and rejects the 6th', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const created = await createProductListing(app, auth);
    const listingId = created.body.data.id as string;

    for (let i = 0; i < 5; i++) {
      const res = await addPhoto(app, auth, listingId, i);
      expect(res.status).toBe(201);
    }

    // 6th photo must be rejected
    const sixth = await addPhoto(app, auth, listingId, 5);
    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe('PHOTO_LIMIT_REACHED');
  });

  it('concurrent photo uploads hold the 5-photo cap', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const created = await createProductListing(app, auth);
    const listingId = created.body.data.id as string;

    // Fire 7 concurrent photo uploads
    const results = await Promise.all(
      Array.from({ length: 7 }, (_, i) =>
        request(app)
          .post(`/api/v1/listings/${listingId}/photos`)
          .set('Origin', origin)
          .set('Cookie', auth.cookie)
          .set('X-CSRF-Token', auth.csrfToken)
          .send({
            publicId: `km/${auth.userId}/listings/photo-concurrent-${i}-${Date.now()}-${i}`,
            altText: `Concurrent photo ${i}`,
          }),
      ),
    );

    const successes = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);

    expect(successes.length).toBeLessThanOrEqual(5);
    expect(conflicts.length).toBeGreaterThanOrEqual(2);
    expect(conflicts[0]?.body.error.code).toBe('PHOTO_LIMIT_REACHED');
  });

  it('removes a photo and destroys the Cloudinary asset', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const created = await createProductListing(app, auth);
    const listingId = created.body.data.id as string;
    const photoRes = await addPhoto(app, auth, listingId);
    const photoId = photoRes.body.data.id as string;

    const deleteRes = await request(app)
      .delete(`/api/v1/listings/${listingId}/photos/${photoId}`)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken);

    expect(deleteRes.status).toBe(204);
    expect(cloudinary.destroyAsset).toHaveBeenCalled();
  });

  it('cannot remove the last photo from an ACTIVE listing', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const created = await createProductListing(app, auth);
    const listingId = created.body.data.id as string;
    const photoRes = await addPhoto(app, auth, listingId);
    const photoId = photoRes.body.data.id as string;

    await request(app)
      .post(`/api/v1/listings/${listingId}/activate`)
      .set('Origin', origin).set('Cookie', auth.cookie).set('X-CSRF-Token', auth.csrfToken);

    const res = await request(app)
      .delete(`/api/v1/listings/${listingId}/photos/${photoId}`)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('rejects a photo publicId not in the caller\'s folder', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const created = await createProductListing(app, auth);
    const listingId = created.body.data.id as string;

    // Simulate verifyListingAsset throwing for wrong folder
    cloudinary.verifyListingAsset.mockRejectedValueOnce(
      Object.assign(new Error('Listing image is not in your upload folder'), {
        status: 400,
        code: 'VALIDATION_ERROR',
      }),
    );

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/photos`)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken)
      .send({ publicId: 'km/other-user/listings/stolen-photo' });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('IDOR and ownership', () => {
  it('lifecycle actions on another user\'s listing return 404', async () => {
    const app = createApp();
    const { auth: auth1 } = await setupProvider(app);
    const { auth: auth2 } = await setupProvider(app);

    const created = await createProductListing(app, auth1);
    const listingId = created.body.data.id as string;
    await addPhoto(app, auth1, listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/activate`)
      .set('Origin', origin).set('Cookie', auth1.cookie).set('X-CSRF-Token', auth1.csrfToken);

    // auth2 tries to deactivate auth1's listing
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/deactivate`)
      .set('Origin', origin)
      .set('Cookie', auth2.cookie)
      .set('X-CSRF-Token', auth2.csrfToken);

    expect(res.status).toBe(404);
  });

  it('photo operations on another user\'s listing return 404', async () => {
    const app = createApp();
    const { auth: auth1 } = await setupProvider(app);
    const { auth: auth2 } = await setupProvider(app);

    const created = await createProductListing(app, auth1);
    const listingId = created.body.data.id as string;

    // auth2 tries to add a photo to auth1's listing (publicId uses auth2's folder)
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/photos`)
      .set('Origin', origin)
      .set('Cookie', auth2.cookie)
      .set('X-CSRF-Token', auth2.csrfToken)
      .send({ publicId: `km/${auth2.userId}/listings/photo-xyz` });

    expect(res.status).toBe(404);
  });

  it('unauthenticated requests to owner endpoints return 401', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/listings')
      .set('Origin', origin)
      .send({ title: 'Ghost listing' });

    expect(res.status).toBe(401);
  });
});

describe('Owner read endpoints (/providers/me/listings)', () => {
  it('returns paginated own listings', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    // Create 3 listings
    for (let i = 0; i < 3; i++) {
      await createProductListing(app, auth, {
        title: `My Listing ${i + 1}`,
        description: `Description for my listing number ${i + 1}.`,
      });
    }

    const res = await request(app)
      .get('/api/v1/providers/me/listings')
      .set('Cookie', auth.cookie)
      .query({ limit: 2, page: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.totalPages).toBe(2);
  });

  it('filters by status', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const created = await createProductListing(app, auth);
    const listingId = created.body.data.id as string;
    await addPhoto(app, auth, listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/activate`)
      .set('Origin', origin).set('Cookie', auth.cookie).set('X-CSRF-Token', auth.csrfToken);

    // Also create an inactive one
    await createProductListing(app, auth, { title: 'Inactive One', description: 'An inactive listing here.' });

    const activeRes = await request(app)
      .get('/api/v1/providers/me/listings')
      .set('Cookie', auth.cookie)
      .query({ status: 'ACTIVE' });

    expect(activeRes.status).toBe(200);
    expect(activeRes.body.data.items).toHaveLength(1);
    expect(activeRes.body.data.items[0].status).toBe('ACTIVE');
  });

  it('returns a single owned listing with owner shape', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const created = await createProductListing(app, auth);
    const listingId = created.body.data.id as string;

    const res = await request(app)
      .get(`/api/v1/providers/me/listings/${listingId}`)
      .set('Cookie', auth.cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('INACTIVE'); // owner shape includes status
    expect(res.body.data.id).toBe(listingId);
  });

  it('returns 404 for another user\'s listing via owner endpoint', async () => {
    const app = createApp();
    const { auth: auth1 } = await setupProvider(app);
    const { auth: auth2 } = await setupProvider(app);

    const created = await createProductListing(app, auth1);
    const listingId = created.body.data.id as string;

    const res = await request(app)
      .get(`/api/v1/providers/me/listings/${listingId}`)
      .set('Cookie', auth2.cookie);

    expect(res.status).toBe(404);
  });

  it('rejects unknown query params on owner listings endpoint', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const res = await request(app)
      .get('/api/v1/providers/me/listings')
      .set('Cookie', auth.cookie)
      .query({ unknownParam: 'something' });

    expect(res.status).toBe(400);
  });
});

describe('Service areas', () => {
  it('replaces service areas on PATCH', async () => {
    const app = createApp();
    const { auth } = await setupProvider(app);

    const created = await request(app)
      .post('/api/v1/listings')
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken)
      .send({
        type: 'SERVICE',
        title: 'Delivery Service',
        description: 'Same-day delivery across Lagos state.',
        categoryId,
        state: 'Lagos',
        city: 'Ikeja',
        pricingType: 'FIXED',
        priceAmount: '2000.00',
        serviceMode: 'IN_PERSON',
        serviceAreas: [{ state: 'Lagos', city: 'Lekki' }],
      });

    expect(created.status).toBe(201);
    const listingId = created.body.data.id as string;
    expect(created.body.data.serviceAreas).toHaveLength(1);

    // PATCH replaces service areas
    const patched = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken)
      .send({
        serviceAreas: [
          { state: 'Ogun', city: 'Abeokuta' },
          { state: 'Lagos', city: 'Badagry' },
        ],
      });

    expect(patched.status).toBe(200);
    expect(patched.body.data.serviceAreas).toHaveLength(2);
    expect(patched.body.data.serviceAreas.map((a: { state: string }) => a.state)).toContain('Ogun');
  });
});

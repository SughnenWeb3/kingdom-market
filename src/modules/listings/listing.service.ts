import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { destroyAsset, verifyListingAsset } from '../../lib/cloudinary.js';
import { logger } from '../../lib/logger.js';
import type {
  AddPhotoInput,
  CreateListingInput,
  OwnerListingsQuery,
  PatchListingInput,
} from './listing.schema.js';

// ── Shape helpers ──────────────────────────────────────────────────────────

const photoSelect = {
  id: true,
  publicId: true,
  secureUrl: true,
  format: true,
  width: true,
  height: true,
  altText: true,
  sortOrder: true,
  createdAt: true,
} satisfies Prisma.ListingPhotoSelect;

const serviceAreaSelect = {
  id: true,
  state: true,
  city: true,
} satisfies Prisma.ServiceAreaSelect;

const categorySelect = {
  id: true,
  name: true,
  slug: true,
} satisfies Prisma.CategorySelect;

const providerSelect = {
  id: true,
  providerName: true,
  profileImageUrl: true,
} satisfies Prisma.ProviderProfileSelect;

const listingInclude = {
  photos: { select: photoSelect, orderBy: { sortOrder: 'asc' as const } },
  serviceAreas: { select: serviceAreaSelect },
  category: { select: categorySelect },
  providerProfile: { select: providerSelect },
} satisfies Prisma.ListingInclude;

type ListingWithIncludes = Prisma.ListingGetPayload<{
  include: typeof listingInclude;
}>;

/** Public shape — no status, no archivedAt, no updatedAt, no photo.publicId */
export const toPublicListing = (listing: ListingWithIncludes) => ({
  id: listing.id,
  type: listing.type,
  title: listing.title,
  description: listing.description,
  category: listing.category,
  state: listing.state,
  city: listing.city,
  pricingType: listing.pricingType,
  priceAmount: listing.priceAmount !== null ? listing.priceAmount.toFixed(2) : null,
  currency: 'NGN',
  serviceMode: listing.serviceMode ?? null,
  serviceAreas: listing.serviceAreas.map((a) => ({ state: a.state, city: a.city })),
  photos: listing.photos.map(({ id, secureUrl, altText, sortOrder }) => ({
    id,
    url: secureUrl,
    altText,
    sortOrder,
  })),
  provider: listing.providerProfile,
  createdAt: listing.createdAt,
});

/** Owner shape — adds status, archivedAt, updatedAt, photo.publicId */
export const toOwnerListing = (listing: ListingWithIncludes) => ({
  ...toPublicListing(listing),
  status: listing.status,
  archivedAt: listing.archivedAt,
  updatedAt: listing.updatedAt,
  photos: listing.photos.map(({ id, publicId, secureUrl, altText, sortOrder }) => ({
    id,
    publicId,
    url: secureUrl,
    altText,
    sortOrder,
  })),
});

// ── Internal helpers ───────────────────────────────────────────────────────

/** Resolve the caller's provider profile id from their user id. Throws FORBIDDEN if none. */
const getProviderProfileId = async (userId: string): Promise<string> => {
  const provider = await prisma.providerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!provider) throw new AppError(403, 'FORBIDDEN', 'Provider profile required');
  return provider.id;
};

/**
 * Load a listing and assert it is owned by the given provider profile.
 * Returns 404 (not 403) on mismatch to avoid revealing existence.
 */
const getOwnedListing = async (
  listingId: string,
  providerProfileId: string,
): Promise<ListingWithIncludes> => {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: listingInclude,
  });
  if (!listing || listing.providerProfileId !== providerProfileId) {
    throw new AppError(404, 'NOT_FOUND', 'Listing not found');
  }
  return listing;
};

/** Validate a categoryId exists and is active. */
const validateCategory = async (categoryId: string): Promise<void> => {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true, isActive: true },
  });
  if (!category || !category.isActive) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Category does not exist or is inactive');
  }
};

/** Re-validate pricing rules in the service layer (mirrors Zod schema). */
const validatePricing = (
  pricingType: string,
  priceAmount: string | null | undefined,
): void => {
  if (pricingType === 'FIXED' || pricingType === 'STARTING_FROM') {
    if (priceAmount === undefined || priceAmount === null) {
      throw new AppError(400, 'VALIDATION_ERROR', 'priceAmount is required for FIXED and STARTING_FROM pricing');
    }
    const amount = parseFloat(priceAmount);
    if (amount <= 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'priceAmount must be greater than 0');
    }
  }
  if (pricingType === 'NEGOTIABLE' || pricingType === 'CONTACT_FOR_PRICE') {
    if (priceAmount !== undefined && priceAmount !== null) {
      throw new AppError(400, 'VALIDATION_ERROR', 'priceAmount must be absent for NEGOTIABLE and CONTACT_FOR_PRICE pricing');
    }
  }
};

/**
 * Check all publishability requirements for a listing.
 * Returns a list of missing-field messages; empty means publishable.
 */
const getPublishabilityErrors = (listing: ListingWithIncludes): string[] => {
  const errors: string[] = [];
  if (!listing.title) errors.push('title is required');
  if (!listing.description) errors.push('description is required');
  if (!listing.state) errors.push('state is required');
  if (!listing.city) errors.push('city is required');
  if (!listing.pricingType) errors.push('pricingType is required');
  if (listing.type === 'SERVICE' && !listing.serviceMode) {
    errors.push('serviceMode is required for SERVICE listings');
  }
  if ((listing.pricingType === 'FIXED' || listing.pricingType === 'STARTING_FROM') && !listing.priceAmount) {
    errors.push('priceAmount is required for this pricing type');
  }
  if (listing.photos.length === 0) {
    errors.push('at least one photo is required to activate');
  }
  return errors;
};

// ── CRUD operations ────────────────────────────────────────────────────────

export const createListing = async (userId: string, input: CreateListingInput) => {
  const providerProfileId = await getProviderProfileId(userId);
  await validateCategory(input.categoryId);
  validatePricing(input.pricingType, input.priceAmount);

  const dedupeAreas = (areas: typeof input.serviceAreas) => {
    if (!areas) return [];
    const seen = new Set<string>();
    return areas.filter((a) => {
      const key = `${a.state}::${a.city.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const listing = await prisma.listing.create({
    data: {
      providerProfileId,
      categoryId: input.categoryId,
      type: input.type,
      title: input.title,
      description: input.description,
      state: input.state,
      city: input.city,
      pricingType: input.pricingType,
      priceAmount: input.priceAmount !== undefined ? new Prisma.Decimal(input.priceAmount) : null,
      serviceMode: input.serviceMode ?? null,
      serviceAreas:
        input.type === 'SERVICE' && input.serviceAreas && input.serviceAreas.length > 0
          ? { create: dedupeAreas(input.serviceAreas) }
          : undefined,
    },
    include: listingInclude,
  });

  logger.info(
    { event: 'listing.created', userId, providerId: providerProfileId, listingId: listing.id },
    'Listing created',
  );
  return toOwnerListing(listing);
};

export const getListing = async (listingId: string) => {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: listingInclude,
  });
  if (!listing || listing.status !== 'ACTIVE') {
    throw new AppError(404, 'NOT_FOUND', 'Listing not found');
  }
  return toPublicListing(listing);
};

export const getOwnListing = async (userId: string, listingId: string) => {
  const providerProfileId = await getProviderProfileId(userId);
  const listing = await getOwnedListing(listingId, providerProfileId);
  return toOwnerListing(listing);
};

export const getOwnListings = async (userId: string, query: OwnerListingsQuery) => {
  const providerProfileId = await getProviderProfileId(userId);
  const { page, limit, status } = query;
  const where: Prisma.ListingWhereInput = {
    providerProfileId,
    ...(status ? { status } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      include: listingInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return {
    items: items.map(toOwnerListing),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
};

export const updateListing = async (
  userId: string,
  listingId: string,
  input: PatchListingInput,
) => {
  const providerProfileId = await getProviderProfileId(userId);
  const current = await getOwnedListing(listingId, providerProfileId);

  if (current.status === 'ARCHIVED') {
    throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Cannot edit an archived listing; restore it first');
  }

  if (input.categoryId) await validateCategory(input.categoryId);

  // Determine effective pricing values (merge patch with existing)
  const effectivePricingType = input.pricingType ?? current.pricingType;
  const effectivePriceAmount =
    input.priceAmount !== undefined
      ? input.priceAmount
      : current.priceAmount !== null
        ? current.priceAmount.toFixed(2)
        : null;
  validatePricing(effectivePricingType, effectivePriceAmount);

  const data: Prisma.ListingUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.categoryId !== undefined) data.category = { connect: { id: input.categoryId } };
  if (input.state !== undefined) data.state = input.state;
  if (input.city !== undefined) data.city = input.city;
  if (input.pricingType !== undefined) data.pricingType = input.pricingType;
  if (input.priceAmount !== undefined) {
    data.priceAmount = input.priceAmount !== null ? new Prisma.Decimal(input.priceAmount) : null;
  }
  if (input.serviceMode !== undefined) data.serviceMode = input.serviceMode;

  // serviceAreas: replace entire set when provided
  if (input.serviceAreas !== undefined) {
    data.serviceAreas = {
      deleteMany: {},
      create: input.serviceAreas.map((a) => ({ state: a.state, city: a.city })),
    };
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data,
    include: listingInclude,
  });

  logger.info(
    { event: 'listing.updated', userId, providerId: providerProfileId, listingId },
    'Listing updated',
  );
  return toOwnerListing(updated);
};

// ── Lifecycle transitions ──────────────────────────────────────────────────

export const activateListing = async (userId: string, listingId: string) => {
  const providerProfileId = await getProviderProfileId(userId);

  // Concurrency-safe: lock the ProviderProfile row to serialize cap checks.
  const result = await prisma.$transaction(async (tx) => {
    // Lock the provider row so concurrent activations are serialized.
    await tx.$executeRaw`SELECT id FROM "ProviderProfile" WHERE id = ${providerProfileId}::uuid FOR UPDATE`;

    const listing = await tx.listing.findUnique({
      where: { id: listingId },
      include: listingInclude,
    });
    if (!listing || listing.providerProfileId !== providerProfileId) {
      throw new AppError(404, 'NOT_FOUND', 'Listing not found');
    }
    if (listing.status !== 'INACTIVE') {
      throw new AppError(
        409,
        'INVALID_STATE_TRANSITION',
        listing.status === 'ARCHIVED'
          ? 'Restore the listing before activating'
          : 'Listing is already active',
      );
    }

    // Check publishability
    const errors = getPublishabilityErrors(listing);
    if (errors.length > 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Listing cannot be activated', errors.map((e) => ({ field: 'listing', message: e })));
    }

    // Enforce 10-active cap
    const activeCount = await tx.listing.count({
      where: { providerProfileId, status: 'ACTIVE' },
    });
    if (activeCount >= 10) {
      throw new AppError(409, 'LISTING_LIMIT_REACHED', 'Provider has reached the maximum of 10 active listings');
    }

    return tx.listing.update({
      where: { id: listingId },
      data: { status: 'ACTIVE' },
      include: listingInclude,
    });
  });

  logger.info(
    { event: 'listing.activated', userId, providerId: providerProfileId, listingId },
    'Listing activated',
  );
  return toOwnerListing(result);
};

export const deactivateListing = async (userId: string, listingId: string) => {
  const providerProfileId = await getProviderProfileId(userId);
  const listing = await getOwnedListing(listingId, providerProfileId);

  if (listing.status !== 'ACTIVE') {
    throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Only ACTIVE listings can be deactivated');
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { status: 'INACTIVE' },
    include: listingInclude,
  });

  logger.info(
    { event: 'listing.deactivated', userId, providerId: providerProfileId, listingId },
    'Listing deactivated',
  );
  return toOwnerListing(updated);
};

export const archiveListing = async (userId: string, listingId: string) => {
  const providerProfileId = await getProviderProfileId(userId);
  const listing = await getOwnedListing(listingId, providerProfileId);

  if (listing.status === 'ARCHIVED') {
    throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Listing is already archived');
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
    include: listingInclude,
  });

  logger.info(
    { event: 'listing.archived', userId, providerId: providerProfileId, listingId },
    'Listing archived',
  );
  return toOwnerListing(updated);
};

export const restoreListing = async (userId: string, listingId: string) => {
  const providerProfileId = await getProviderProfileId(userId);
  const listing = await getOwnedListing(listingId, providerProfileId);

  if (listing.status !== 'ARCHIVED') {
    throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Only ARCHIVED listings can be restored');
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { status: 'INACTIVE', archivedAt: null },
    include: listingInclude,
  });

  logger.info(
    { event: 'listing.restored', userId, providerId: providerProfileId, listingId },
    'Listing restored',
  );
  return toOwnerListing(updated);
};

// ── Photo management ───────────────────────────────────────────────────────

export const addPhoto = async (userId: string, listingId: string, input: AddPhotoInput) => {
  const providerProfileId = await getProviderProfileId(userId);

  // Verify the Cloudinary asset before touching the DB
  const asset = await verifyListingAsset(userId, input.publicId);

  // Concurrency-safe: lock the Listing row to serialize photo-cap checks
  const photo = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Listing" WHERE id = ${listingId}::uuid FOR UPDATE`;

    const listing = await tx.listing.findUnique({
      where: { id: listingId },
      select: { id: true, providerProfileId: true, _count: { select: { photos: true } } },
    });
    if (!listing || listing.providerProfileId !== providerProfileId) {
      throw new AppError(404, 'NOT_FOUND', 'Listing not found');
    }
    if (listing._count.photos >= 5) {
      throw new AppError(409, 'PHOTO_LIMIT_REACHED', 'Listing already has the maximum of 5 photos');
    }

    return tx.listingPhoto.create({
      data: {
        listingId,
        publicId: asset.publicId,
        secureUrl: asset.secureUrl,
        format: asset.format,
        width: asset.width,
        height: asset.height,
        altText: input.altText ?? null,
        sortOrder: input.sortOrder ?? listing._count.photos,
      },
      select: {
        id: true,
        publicId: true,
        secureUrl: true,
        format: true,
        width: true,
        height: true,
        altText: true,
        sortOrder: true,
        createdAt: true,
      },
    });
  });

  logger.info(
    { event: 'listing.photo.added', userId, providerId: providerProfileId, listingId, photoId: photo.id },
    'Photo added to listing',
  );
  return photo;
};

export const removePhoto = async (userId: string, listingId: string, photoId: string) => {
  const providerProfileId = await getProviderProfileId(userId);
  const listing = await getOwnedListing(listingId, providerProfileId);

  const photo = await prisma.listingPhoto.findUnique({
    where: { id: photoId },
    select: { id: true, listingId: true, publicId: true },
  });
  if (!photo || photo.listingId !== listingId) {
    throw new AppError(404, 'NOT_FOUND', 'Photo not found');
  }

  // Guard: cannot remove the last photo from an ACTIVE listing
  if (listing.status === 'ACTIVE' && listing.photos.length <= 1) {
    throw new AppError(
      409,
      'INVALID_STATE_TRANSITION',
      'Cannot remove the last photo of an active listing; deactivate first',
    );
  }

  await prisma.listingPhoto.delete({ where: { id: photoId } });

  // Best-effort Cloudinary cleanup; failure is logged but not fatal
  void destroyAsset(photo.publicId).catch(() =>
    logger.warn(
      { event: 'cloudinary.destroy.failed', providerId: providerProfileId, listingId, photoId },
      'Photo asset could not be destroyed in Cloudinary',
    ),
  );

  logger.info(
    { event: 'listing.photo.removed', userId, providerId: providerProfileId, listingId, photoId },
    'Photo removed from listing',
  );
};

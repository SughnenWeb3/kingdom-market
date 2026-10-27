import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { normalizeNigerianPhone } from '../../lib/phone.js';
import { destroyAsset, verifyProfileAsset } from '../../lib/cloudinary.js';
import { logger } from '../../lib/logger.js';
import type { CreateProviderInput, PatchProviderInput } from './provider.schema.js';

const providerInclude = {
  categories: { select: { category: { select: { id: true, name: true, slug: true } } } },
} satisfies Prisma.ProviderProfileInclude;

type ProviderWithCategories = Prisma.ProviderProfileGetPayload<{ include: typeof providerInclude }>;

const categoryRefs = (provider: ProviderWithCategories) => provider.categories.map(({ category }) => category);
export const toOwnProvider = (provider: ProviderWithCategories, pendingPhoneChange: { id: string; proposedPhone: string; createdAt: Date } | null) => ({
  id: provider.id, providerName: provider.providerName, description: provider.description,
  profileImageUrl: provider.profileImageUrl, state: provider.state, city: provider.city,
  phoneNumber: provider.phoneNumber, whatsappNumber: provider.whatsappNumber,
  churchAffiliation: provider.churchAffiliation, operatingHours: provider.operatingHours,
  socialLinks: provider.socialLinks, categories: categoryRefs(provider), createdAt: provider.createdAt,
  updatedAt: provider.updatedAt, pendingPhoneChange,
});

export const toPublicProvider = (provider: ProviderWithCategories & { _count: { listings: number } }) => ({
  id: provider.id, providerName: provider.providerName, description: provider.description,
  profileImageUrl: provider.profileImageUrl, state: provider.state, city: provider.city,
  churchAffiliation: provider.churchAffiliation, operatingHours: provider.operatingHours,
  socialLinks: provider.socialLinks, categories: categoryRefs(provider),
  activeListingCount: provider._count.listings, createdAt: provider.createdAt,
});

const validateCategories = async (categoryIds: string[]): Promise<void> => {
  const categories = await prisma.category.findMany({ where: { id: { in: categoryIds }, isActive: true }, select: { id: true } });
  if (categories.length !== categoryIds.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Categories must exist and be active');
  }
};

const getProvider = async (userId: string): Promise<ProviderWithCategories> => {
  const provider = await prisma.providerProfile.findUnique({ where: { userId }, include: providerInclude });
  if (!provider) throw new AppError(403, 'FORBIDDEN', 'Provider profile required');
  return provider;
};

const getPending = (userId: string) => prisma.phoneChangeRequest.findFirst({
  where: { userId, status: 'PENDING' }, select: { id: true, proposedPhone: true, createdAt: true },
});

export const createProvider = async (userId: string, input: CreateProviderInput) => {
  const existing = await prisma.providerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (existing) throw new AppError(409, 'PROVIDER_EXISTS', 'Provider profile already exists');
  await validateCategories(input.categoryIds);
  const asset = await verifyProfileAsset(userId, input.profileImagePublicId);
  try {
    const provider = await prisma.providerProfile.create({
      data: {
        userId, providerName: input.providerName, description: input.description, state: input.state, city: input.city,
        phoneNumber: normalizeNigerianPhone(input.phoneNumber), whatsappNumber: normalizeNigerianPhone(input.whatsappNumber),
        profileImagePublicId: asset.publicId, profileImageUrl: asset.secureUrl,
        churchAffiliation: input.churchAffiliation ?? null,
        operatingHours: input.operatingHours === null ? Prisma.JsonNull : input.operatingHours ?? undefined,
        socialLinks: input.socialLinks === null ? Prisma.JsonNull : input.socialLinks ?? undefined,
        categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
      }, include: providerInclude,
    });
    logger.info({ event: 'provider.created', userId, providerId: provider.id }, 'Provider profile created');
    return toOwnProvider(provider, null);
  } catch (error) {
    if (error instanceof AppError) throw error;
    // The unique user constraint is authoritative under concurrent onboarding.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new AppError(409, 'PROVIDER_EXISTS', 'Provider profile already exists');
    }
    throw error;
  }
};

export const getOwnProvider = async (userId: string) => {
  const [provider, pending] = await Promise.all([getProvider(userId), getPending(userId)]);
  return toOwnProvider(provider, pending);
};

export const updateProvider = async (userId: string, input: PatchProviderInput) => {
  const current = await getProvider(userId);
  if (input.categoryIds) await validateCategories(input.categoryIds);
  const asset = input.profileImagePublicId ? await verifyProfileAsset(userId, input.profileImagePublicId) : null;
  const data: Prisma.ProviderProfileUpdateInput = {};
  if (input.providerName !== undefined) data.providerName = input.providerName;
  if (input.description !== undefined) data.description = input.description;
  if (input.state !== undefined) data.state = input.state;
  if (input.city !== undefined) data.city = input.city;
  if (input.whatsappNumber !== undefined) data.whatsappNumber = normalizeNigerianPhone(input.whatsappNumber);
  if (input.churchAffiliation !== undefined) data.churchAffiliation = input.churchAffiliation;
  if (input.operatingHours !== undefined) data.operatingHours = input.operatingHours === null ? Prisma.JsonNull : input.operatingHours;
  if (input.socialLinks !== undefined) data.socialLinks = input.socialLinks === null ? Prisma.JsonNull : input.socialLinks;
  if (asset) { data.profileImagePublicId = asset.publicId; data.profileImageUrl = asset.secureUrl; }
  if (input.categoryIds) data.categories = { deleteMany: {}, create: input.categoryIds.map((categoryId) => ({ categoryId })) };
  const updated = await prisma.providerProfile.update({ where: { id: current.id }, data, include: providerInclude });
  if (asset && current.profileImagePublicId !== asset.publicId) {
    void destroyAsset(current.profileImagePublicId).catch(() => logger.warn({ event: 'cloudinary.destroy.failed', providerId: current.id }, 'Old profile asset could not be destroyed'));
  }
  return toOwnProvider(updated, await getPending(userId));
};

export const getPublicProvider = async (providerId: string) => {
  const provider = await prisma.providerProfile.findUnique({
    where: { id: providerId }, include: { ...providerInclude, _count: { select: { listings: { where: { status: 'ACTIVE' } } } } },
  });
  if (!provider) throw new AppError(404, 'NOT_FOUND', 'Provider not found');
  return toPublicProvider(provider);
};

export const getContact = async (providerId: string) => {
  const provider = await prisma.providerProfile.findUnique({ where: { id: providerId }, select: { id: true, phoneNumber: true, whatsappNumber: true } });
  if (!provider) throw new AppError(404, 'NOT_FOUND', 'Provider not found');
  return { providerId: provider.id, phoneNumber: provider.phoneNumber, whatsappNumber: provider.whatsappNumber };
};

export const requestPhoneChange = async (userId: string, proposedPhone: string) => {
  const provider = await getProvider(userId);
  const normalized = normalizeNigerianPhone(proposedPhone);
  if (normalized === provider.phoneNumber) throw new AppError(400, 'VALIDATION_ERROR', 'Proposed phone number is already active');
  try {
    const request = await prisma.phoneChangeRequest.create({ data: { userId, proposedPhone: normalized }, select: { id: true, proposedPhone: true, status: true, createdAt: true } });
    logger.info({ event: 'phone_change.requested', userId, providerId: provider.id }, 'Phone change requested');
    return request;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new AppError(409, 'PENDING_REQUEST_EXISTS', 'A phone change request is already pending');
    }
    throw error;
  }
};

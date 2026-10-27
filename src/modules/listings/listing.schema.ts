import { z } from 'zod';

import { NIGERIAN_STATES } from '../../lib/locations.js';

// ── Shared field definitions ───────────────────────────────────────────────

const city = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .transform((v) => v.replace(/\s+/g, ' '));

const serviceArea = z
  .object({ state: z.enum(NIGERIAN_STATES), city })
  .strict();

// ── Create listing schema ──────────────────────────────────────────────────

export const createListingSchema = z
  .object({
    type: z.enum(['PRODUCT', 'SERVICE']),
    title: z.string().trim().min(3).max(100),
    description: z.string().trim().min(10).max(2000),
    categoryId: z.uuid(),
    state: z.enum(NIGERIAN_STATES),
    city,
    pricingType: z.enum(['FIXED', 'STARTING_FROM', 'NEGOTIABLE', 'CONTACT_FOR_PRICE']),
    priceAmount: z
      .string()
      .regex(/^\d{1,10}(\.\d{1,2})?$/, 'priceAmount must be a decimal string with up to 2 places')
      .optional(),
    serviceMode: z.enum(['REMOTE', 'IN_PERSON', 'BOTH']).optional(),
    serviceAreas: z.array(serviceArea).max(10).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // Pricing: FIXED and STARTING_FROM require a positive priceAmount
    if (data.pricingType === 'FIXED' || data.pricingType === 'STARTING_FROM') {
      if (data.priceAmount === undefined) {
        ctx.addIssue({ code: 'custom', path: ['priceAmount'], message: 'priceAmount is required for FIXED and STARTING_FROM pricing' });
      } else {
        const amount = parseFloat(data.priceAmount);
        if (amount <= 0) {
          ctx.addIssue({ code: 'custom', path: ['priceAmount'], message: 'priceAmount must be greater than 0' });
        }
        if (amount > 9_999_999_999.99) {
          ctx.addIssue({ code: 'custom', path: ['priceAmount'], message: 'priceAmount exceeds maximum allowed value' });
        }
      }
    }
    if (data.pricingType === 'NEGOTIABLE' || data.pricingType === 'CONTACT_FOR_PRICE') {
      if (data.priceAmount !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['priceAmount'], message: 'priceAmount must be absent for NEGOTIABLE and CONTACT_FOR_PRICE pricing' });
      }
    }

    // serviceMode: required for SERVICE, forbidden for PRODUCT
    if (data.type === 'SERVICE' && !data.serviceMode) {
      ctx.addIssue({ code: 'custom', path: ['serviceMode'], message: 'serviceMode is required for SERVICE listings' });
    }
    if (data.type === 'PRODUCT' && data.serviceMode) {
      ctx.addIssue({ code: 'custom', path: ['serviceMode'], message: 'serviceMode is not allowed for PRODUCT listings' });
    }

    // serviceAreas only allowed for SERVICE listings
    if (data.type === 'PRODUCT' && data.serviceAreas && data.serviceAreas.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['serviceAreas'], message: 'serviceAreas are only allowed for SERVICE listings' });
    }
  });

// ── Patch listing schema ───────────────────────────────────────────────────

export const patchListingSchema = z
  .object({
    title: z.string().trim().min(3).max(100).optional(),
    description: z.string().trim().min(10).max(2000).optional(),
    categoryId: z.uuid().optional(),
    state: z.enum(NIGERIAN_STATES).optional(),
    city: city.optional(),
    pricingType: z.enum(['FIXED', 'STARTING_FROM', 'NEGOTIABLE', 'CONTACT_FOR_PRICE']).optional(),
    priceAmount: z
      .string()
      .regex(/^\d{1,10}(\.\d{1,2})?$/, 'priceAmount must be a decimal string with up to 2 places')
      .nullable()
      .optional(),
    serviceMode: z.enum(['REMOTE', 'IN_PERSON', 'BOTH']).nullable().optional(),
    serviceAreas: z.array(serviceArea).max(10).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'At least one field is required' });
    }
    // If both pricingType and priceAmount are being updated together, validate combo
    if (data.pricingType !== undefined && data.priceAmount !== undefined) {
      if (data.pricingType === 'FIXED' || data.pricingType === 'STARTING_FROM') {
        if (data.priceAmount === null) {
          ctx.addIssue({ code: 'custom', path: ['priceAmount'], message: 'priceAmount is required for FIXED and STARTING_FROM pricing' });
        } else {
          const amount = parseFloat(data.priceAmount);
          if (amount <= 0) {
            ctx.addIssue({ code: 'custom', path: ['priceAmount'], message: 'priceAmount must be greater than 0' });
          }
        }
      }
      if (data.pricingType === 'NEGOTIABLE' || data.pricingType === 'CONTACT_FOR_PRICE') {
        if (data.priceAmount !== null) {
          ctx.addIssue({ code: 'custom', path: ['priceAmount'], message: 'priceAmount must be absent for NEGOTIABLE and CONTACT_FOR_PRICE pricing' });
        }
      }
    }
  });

// ── Add photo schema ───────────────────────────────────────────────────────

export const addPhotoSchema = z
  .object({
    publicId: z.string().trim().min(1).max(500),
    altText: z.string().trim().min(1).max(200).optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict();

// ── Owner listing list query schema ───────────────────────────────────────

export const ownerListingsQuerySchema = z
  .object({
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

// ── Types ──────────────────────────────────────────────────────────────────

export type CreateListingInput = z.infer<typeof createListingSchema>;
export type PatchListingInput = z.infer<typeof patchListingSchema>;
export type AddPhotoInput = z.infer<typeof addPhotoSchema>;
export type OwnerListingsQuery = z.infer<typeof ownerListingsQuerySchema>;

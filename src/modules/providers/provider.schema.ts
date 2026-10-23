import { z } from 'zod';

import { NIGERIAN_STATES } from '../../lib/locations.js';

const city = z.string().trim().min(1).max(80).transform((value) => value.replace(/\s+/g, ' '));
const hours = z.object({ open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }).strict();
const operatingHours = z.object({
  mon: hours.nullable(), tue: hours.nullable(), wed: hours.nullable(), thu: hours.nullable(),
  fri: hours.nullable(), sat: hours.nullable(), sun: hours.nullable(),
}).strict();
const socialLinks = z.object({
  instagram: z.url().refine((value) => value.startsWith('https://')).optional(),
  facebook: z.url().refine((value) => value.startsWith('https://')).optional(),
  x: z.url().refine((value) => value.startsWith('https://')).optional(),
  tiktok: z.url().refine((value) => value.startsWith('https://')).optional(),
  website: z.url().refine((value) => value.startsWith('https://')).optional(),
}).strict();

const editableFields = {
  providerName: z.string().trim().min(2).max(80),
  description: z.string().trim().min(10).max(500),
  profileImagePublicId: z.string().trim().min(1).max(500),
  state: z.enum(NIGERIAN_STATES),
  city,
  whatsappNumber: z.string().trim().min(1).max(40),
  categoryIds: z.array(z.uuid()).min(1).max(5).refine((ids) => new Set(ids).size === ids.length, 'Category IDs must be unique'),
  churchAffiliation: z.string().trim().min(1).max(80).nullable().optional(),
  operatingHours: operatingHours.nullable().optional(),
  socialLinks: socialLinks.nullable().optional(),
};

export const createProviderSchema = z.object({
  ...editableFields,
  phoneNumber: z.string().trim().min(1).max(40),
}).strict();

export const patchProviderSchema = z.object({ ...editableFields, phoneNumber: z.string().optional() }).partial().strict().superRefine((value, ctx) => {
  if ('phoneNumber' in value) ctx.addIssue({ code: 'custom', path: ['phoneNumber'], message: 'Use /providers/me/phone-change-requests to change your phone number' });
  if (Object.keys(value).length === 0) ctx.addIssue({ code: 'custom', message: 'At least one field is required' });
}).transform(({ phoneNumber: _phoneNumber, ...value }) => value);

export const phoneChangeSchema = z.object({ proposedPhone: z.string().trim().min(1).max(40) }).strict();
export const uploadSignatureSchema = z.object({ purpose: z.enum(['PROFILE', 'LISTING']) }).strict();

export type CreateProviderInput = z.infer<typeof createProviderSchema>;
export type PatchProviderInput = z.infer<typeof patchProviderSchema>;

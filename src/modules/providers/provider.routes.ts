import { Router } from 'express';
import type { RequestHandler } from 'express';

import { requireAuth } from '../../middleware/authenticate.js';
import { phoneChangeLimiter } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { contact, create, getMine, getPublic, patchMine, phoneChange } from './provider.controller.js';
import { createProviderSchema, patchProviderSchema, phoneChangeSchema } from './provider.schema.js';
import { AppError } from '../../lib/errors.js';
import { getOwnListingHandler, getOwnListingsHandler } from '../listings/listing.controller.js';
import { ownerListingsQuerySchema } from '../listings/listing.schema.js';

const rejectDirectPhonePatch: RequestHandler = (req, _res, next) => {
  if (typeof req.body === 'object' && req.body !== null && 'phoneNumber' in req.body) {
    next(new AppError(400, 'VALIDATION_ERROR', 'Use /providers/me/phone-change-requests to change your phone number'));
    return;
  }
  next();
};

export const createProviderRouter = (): Router => {
  const router = Router();
  router.post('/me', requireAuth, validate(createProviderSchema), create);
  router.get('/me', requireAuth, getMine);
  router.patch('/me', requireAuth, rejectDirectPhonePatch, validate(patchProviderSchema), patchMine);
  router.post('/me/phone-change-requests', requireAuth, phoneChangeLimiter, validate(phoneChangeSchema), phoneChange);

  // Owner listing read endpoints
  router.get('/me/listings', requireAuth, validate(ownerListingsQuerySchema, 'query'), getOwnListingsHandler);
  router.get('/me/listings/:listingId', requireAuth, getOwnListingHandler);

  router.get('/:providerId/contact', requireAuth, contact);
  router.get('/:providerId', getPublic);
  return router;
};

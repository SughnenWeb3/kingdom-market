import { Router } from 'express';

import { requireAuth } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import {
  activate,
  addListingPhoto,
  archive,
  create,
  deleteListingPhoto,
  deactivate,
  getPublicListing,
  patch,
  restore,
} from './listing.controller.js';
import { addPhotoSchema, createListingSchema, patchListingSchema } from './listing.schema.js';

export const createListingRouter = (): Router => {
  const router = Router();

  // Public
  router.get('/:listingId', getPublicListing);

  // Owner (provider required is enforced in the service layer)
  router.post('/', requireAuth, validate(createListingSchema), create);
  router.patch('/:listingId', requireAuth, validate(patchListingSchema), patch);
  router.post('/:listingId/activate', requireAuth, activate);
  router.post('/:listingId/deactivate', requireAuth, deactivate);
  router.post('/:listingId/archive', requireAuth, archive);
  router.post('/:listingId/restore', requireAuth, restore);
  router.post('/:listingId/photos', requireAuth, validate(addPhotoSchema), addListingPhoto);
  router.delete('/:listingId/photos/:photoId', requireAuth, deleteListingPhoto);

  return router;
};

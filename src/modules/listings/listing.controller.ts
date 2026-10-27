import type { Request, Response } from 'express';

import { AppError } from '../../lib/errors.js';
import { success } from '../../lib/response.js';
import type { AddPhotoInput, CreateListingInput, OwnerListingsQuery, PatchListingInput } from './listing.schema.js';
import {
  activateListing,
  addPhoto,
  archiveListing,
  createListing,
  deactivateListing,
  getListing,
  getOwnListing,
  getOwnListings,
  removePhoto,
  restoreListing,
  updateListing,
} from './listing.service.js';

const getUserId = (req: Request): string => {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  return req.auth.userId;
};

const getListingId = (req: Request): string => {
  const id = req.params.listingId;
  if (typeof id !== 'string' || !id) throw new AppError(404, 'NOT_FOUND', 'Listing not found');
  return id;
};

const getPhotoId = (req: Request): string => {
  const id = req.params.photoId;
  if (typeof id !== 'string' || !id) throw new AppError(404, 'NOT_FOUND', 'Photo not found');
  return id;
};

// ── Public endpoints ───────────────────────────────────────────────────────

export const getPublicListing = async (req: Request, res: Response): Promise<void> => {
  success(res, 200, await getListing(getListingId(req)));
};

// ── Owner endpoints ────────────────────────────────────────────────────────

export const create = async (req: Request, res: Response): Promise<void> => {
  success(res, 201, await createListing(getUserId(req), req.body as CreateListingInput));
};

export const patch = async (req: Request, res: Response): Promise<void> => {
  success(res, 200, await updateListing(getUserId(req), getListingId(req), req.body as PatchListingInput));
};

export const activate = async (req: Request, res: Response): Promise<void> => {
  success(res, 200, await activateListing(getUserId(req), getListingId(req)));
};

export const deactivate = async (req: Request, res: Response): Promise<void> => {
  success(res, 200, await deactivateListing(getUserId(req), getListingId(req)));
};

export const archive = async (req: Request, res: Response): Promise<void> => {
  success(res, 200, await archiveListing(getUserId(req), getListingId(req)));
};

export const restore = async (req: Request, res: Response): Promise<void> => {
  success(res, 200, await restoreListing(getUserId(req), getListingId(req)));
};

export const addListingPhoto = async (req: Request, res: Response): Promise<void> => {
  success(res, 201, await addPhoto(getUserId(req), getListingId(req), req.body as AddPhotoInput));
};

export const deleteListingPhoto = async (req: Request, res: Response): Promise<void> => {
  await removePhoto(getUserId(req), getListingId(req), getPhotoId(req));
  res.status(204).send();
};

// ── Owner-scoped read endpoints (mounted under /providers/me/listings) ─────

export const getOwnListingHandler = async (req: Request, res: Response): Promise<void> => {
  success(res, 200, await getOwnListing(getUserId(req), getListingId(req)));
};

export const getOwnListingsHandler = async (req: Request, res: Response): Promise<void> => {
  success(res, 200, await getOwnListings(getUserId(req), req.validatedQuery as OwnerListingsQuery));
};

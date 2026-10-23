import type { Request, Response } from 'express';

import { AppError } from '../../lib/errors.js';
import { success } from '../../lib/response.js';
import type { CreateProviderInput, PatchProviderInput } from './provider.schema.js';
import { createProvider, getContact, getOwnProvider, getPublicProvider, requestPhoneChange, updateProvider } from './provider.service.js';

const userId = (req: Request): string => {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  return req.auth.userId;
};

export const create = async (req: Request, res: Response): Promise<void> => { success(res, 201, await createProvider(userId(req), req.body as CreateProviderInput)); };
export const getMine = async (req: Request, res: Response): Promise<void> => { success(res, 200, await getOwnProvider(userId(req))); };
export const patchMine = async (req: Request, res: Response): Promise<void> => { success(res, 200, await updateProvider(userId(req), req.body as PatchProviderInput)); };
const providerId = (req: Request): string => {
  const id = req.params.providerId;
  if (typeof id !== 'string') throw new AppError(404, 'NOT_FOUND', 'Provider not found');
  return id;
};
export const getPublic = async (req: Request, res: Response): Promise<void> => { success(res, 200, await getPublicProvider(providerId(req))); };
export const contact = async (req: Request, res: Response): Promise<void> => { res.set('Cache-Control', 'no-store'); success(res, 200, await getContact(providerId(req))); };
export const phoneChange = async (req: Request, res: Response): Promise<void> => { success(res, 201, await requestPhoneChange(userId(req), (req.body as { proposedPhone: string }).proposedPhone)); };

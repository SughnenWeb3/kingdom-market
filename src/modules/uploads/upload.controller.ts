import type { Request, Response } from 'express';

import { AppError } from '../../lib/errors.js';
import { success } from '../../lib/response.js';
import { createUploadSignature } from '../../lib/cloudinary.js';

export const signature = (req: Request, res: Response): void => {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  success(res, 200, createUploadSignature(req.auth.userId, (req.body as { purpose: 'PROFILE' | 'LISTING' }).purpose));
};

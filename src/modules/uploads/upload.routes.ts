import { Router } from 'express';

import { requireAuth } from '../../middleware/authenticate.js';
import { uploadSignatureLimiter } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { uploadSignatureSchema } from '../providers/provider.schema.js';
import { signature } from './upload.controller.js';

export const createUploadRouter = (): Router => {
  const router = Router();
  router.post('/signature', requireAuth, uploadSignatureLimiter, validate(uploadSignatureSchema), signature);
  return router;
};

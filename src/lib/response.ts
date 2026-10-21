import type { Response } from 'express';

import type { ErrorDetail } from './errors.js';

export const success = <T>(res: Response, status: number, data: T): Response => {
  return res.status(status).json({ success: true, data });
};

export const error = (
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: ErrorDetail[],
): Response => {
  return res.status(status).json({ success: false, error: { code, message, details } });
};

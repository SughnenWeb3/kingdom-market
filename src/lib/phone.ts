import { parsePhoneNumberFromString } from 'libphonenumber-js';

import { AppError } from './errors.js';

export const normalizeNigerianPhone = (value: string): string => {
  const phone = parsePhoneNumberFromString(value.trim(), 'NG');
  if (!phone || !phone.isValid() || phone.country !== 'NG') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Enter a valid Nigerian phone number');
  }
  return phone.number;
};

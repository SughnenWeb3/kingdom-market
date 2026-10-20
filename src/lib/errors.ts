export const errorCodes = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'CSRF_INVALID',
  'NOT_FOUND',
  'EMAIL_TAKEN',
  'ACCOUNT_EXISTS',
  'PROVIDER_EXISTS',
  'LISTING_LIMIT_REACHED',
  'PHOTO_LIMIT_REACHED',
  'INVALID_STATE_TRANSITION',
  'PENDING_REQUEST_EXISTS',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export type ErrorDetail = {
  field: string;
  message: string;
};

export class AppError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

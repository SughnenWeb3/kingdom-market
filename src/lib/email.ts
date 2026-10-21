// Email normalization applied everywhere email is stored or compared.
// trim + lowercase in one shared function so there is never a mismatch.
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

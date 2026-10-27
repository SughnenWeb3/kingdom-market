// Augment Express's Request with auth context attached by middleware.
declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    auth?: AuthContext;
    sessionTokenHash?: string;
    validatedQuery?: unknown;
  }
}

export interface AuthContext {
  userId: string;
  sessionId: string;
}

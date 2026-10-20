# Kingdom Market: Technical Requirements Document (TRD)

Companion to `docs/PRD.md`. The PRD says **what** and **why**; this document says **how**. If the two conflict, the PRD wins on behavior and this TRD wins on implementation. Raise conflicts; do not resolve them silently.

## 1. Runtime and tooling

| Item | Decision |
|---|---|
| Node.js | Active LTS (22.x). Set `engines` in `package.json` and `.nvmrc`. |
| Language | TypeScript, `strict: true`, `noUncheckedIndexedAccess: true` |
| Modules | ESM (`"type": "module"`, `module: NodeNext`) |
| Framework | Express 5 (native async error propagation) |
| Dev / build | `tsx watch` for dev; `tsc` to `dist/` for production |
| Lint / format | ESLint (typescript-eslint) + Prettier |
| Package manager | npm, committed `package-lock.json`, exact versions pinned for Prisma packages |
| Prisma | v7 with `prisma-client` generator, `@prisma/adapter-pg`, config in `prisma.config.ts`. **Do not rely on memory for Prisma 7 APIs; check the official docs.** |

## 2. Layering rules

```
route → middleware → controller → service → prisma
```

- **Routes:** path, middleware chain, controller binding only.
- **Controllers:** parse validated input, call one service function, shape the HTTP response. No business logic, no Prisma.
- **Services:** all business rules, authorization checks, transactions. The only layer that imports Prisma.
- **Schemas:** Zod schemas per module; request types are `z.infer`.
- Modules may call other modules' **services**, never their controllers or Prisma models directly.
- No circular imports between modules. Shared code goes in `src/lib`.

## 3. Request lifecycle (middleware order)

1. `requestId` (UUID, set `X-Request-Id`, attach to logger)
2. `helmet`
3. `cors` (allowlist = `FRONTEND_URL`, `credentials: true`)
4. `express.json({ limit: "100kb" })`, `cookieParser`
5. Pino HTTP logger (with redaction)
6. Rate limiter (per route group)
7. `loadSession` (optional; attaches `req.auth` if a valid session exists)
8. `csrf` (state-changing methods only)
9. Route-level: `requireAuth` → `validate(schema)` → controller
10. 404 handler → central `errorHandler`

`app.set("trust proxy", <configurable>)` so rate limiting and `Secure` cookies work behind a proxy.

## 4. Configuration

All env vars are parsed once in `src/config/env.ts` with Zod. The process **exits at boot** if validation fails. No `process.env` access outside that file.

Required variables (in addition to those in the PRD `.env.example`):

```
CSRF_SECRET=            # >= 32 random bytes, base64
TRUST_PROXY=0           # number of proxy hops
LOG_LEVEL=info
CLOUDINARY_UPLOAD_PRESET=km_signed
CLOUDINARY_UPLOAD_FOLDER_ROOT=km
```

Add `TEST_DATABASE_URL` for tests. Never commit `.env`.

## 5. Errors and responses

```ts
class AppError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public details?: { field: string; message: string }[],
  ) { super(message); }
}
```

Error codes: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `INVALID_CREDENTIALS` (401), `FORBIDDEN` (403), `CSRF_INVALID` (403), `NOT_FOUND` (404), `EMAIL_TAKEN` (409), `ACCOUNT_EXISTS` (409), `PROVIDER_EXISTS` (409), `LISTING_LIMIT_REACHED` (409), `PHOTO_LIMIT_REACHED` (409), `INVALID_STATE_TRANSITION` (409), `PENDING_REQUEST_EXISTS` (409), `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA` (415), `RATE_LIMITED` (429), `INTERNAL` (500).

- `errorHandler` maps `AppError`, `ZodError`, and known Prisma errors (`P2002` → 409, `P2025` → 404). Everything else is a logged 500 with a generic message.
- Responses use the envelope in PRD §8. Stack traces and SQL never leave the process.
- Use `404` (not `403`) when a resource exists but is not owned by the caller.

## 6. Authentication

### 6.1 Passwords
- `bcrypt`, cost from `BCRYPT_ROUNDS` (default 12).
- Validate **before hashing**: length ≥ 12 characters, `Buffer.byteLength(pw, "utf8") <= 72`, not whitespace-only.
- Unknown-email login still runs a bcrypt compare against a constant dummy hash, so timing does not reveal account existence. Both failure paths return `INVALID_CREDENTIALS`.
- Email normalization: `trim().toLowerCase()`, applied in one shared function used everywhere.

### 6.2 Sessions
- Token: 32 random bytes (`crypto.randomBytes`), base64url. Stored as **SHA-256 hash** (`tokenHash`). SHA-256 is correct here because the token is high-entropy; bcrypt is for passwords only.
- Cookie `km_session`: `HttpOnly`, `Secure` (production), `SameSite=Lax`, `Path=/`, `Max-Age` = absolute lifetime.
- On each request: look up by hash; reject if `expiresAt < now` or `lastSeenAt < now - idleTimeout`. Update `lastSeenAt` at most once per minute to avoid a write per request.
- New session (and new token) on every login; any prior token from the same browser is revoked.
- Logout deletes the session row and clears the cookie.
- `setInterval(...).unref()` in `server.ts` purges expired sessions hourly.

### 6.3 CSRF
- Every state-changing request (`POST`, `PATCH`, `PUT`, `DELETE`) must pass:
  1. **Origin check:** `Origin` (or `Referer` fallback) must equal `FRONTEND_URL`'s origin.
  2. **Token check** (authenticated requests): header `X-CSRF-Token` must equal `HMAC-SHA256(CSRF_SECRET, tokenHash)`, compared with `timingSafeEqual`.
- The token is returned in `register`, `login`, Google callback redirect flow (via `/auth/me`), and `me` responses as `csrfToken`.
- Unauthenticated `POST`s (`register`, `login`) are covered by the Origin check and rate limits.

### 6.4 Google sign-in
- Use the `openid-client` library: authorization code + **PKCE**, `state`, `nonce`.
- `state`, `nonce`, and `code_verifier` live in a short-lived (10 min) signed, `HttpOnly` cookie, cleared on callback.
- Require `email_verified === true` from Google.
- Identity key is `(provider="google", providerAccountId=sub)`.
  - Existing OAuthAccount → log in.
  - No OAuthAccount, email unused → create user (`passwordHash = null`) + OAuthAccount.
  - No OAuthAccount, email **already belongs to a password account** → **do not link.** Return `ACCOUNT_EXISTS` (redirect to frontend with an error code). An explicit linking flow is post-MVP.
- On success: create session, redirect to `FRONTEND_URL`.

## 7. Authorization

- `requireAuth` guarantees `req.auth = { userId, sessionId }`.
- `userId` always comes from the session, never from body, query, or params.
- Ownership helper (in listings service): load listing, compare `listing.providerProfileId` to the caller's provider profile id; if mismatch, throw `NOT_FOUND`.
- `requireProvider` loads the caller's `ProviderProfile` or throws `FORBIDDEN` with message "Provider profile required".

## 8. Concurrency-critical operations

All run inside `prisma.$transaction`, locking a parent row first.

**Activate listing (10-active cap)**
```
BEGIN
  SELECT id FROM "ProviderProfile" WHERE id = $providerId FOR UPDATE   -- $queryRaw
  load listing (must belong to provider; status must be INACTIVE; else INVALID_STATE_TRANSITION)
  validate publishable (see §9)
  count ACTIVE listings for provider; if >= 10 → LISTING_LIMIT_REACHED
  update status = ACTIVE
COMMIT
```

**Add photo (5-photo cap)**: lock the `Listing` row `FOR UPDATE`, count photos, reject at 5, insert.

**Phone-change request**: partial unique index (raw SQL in migration) enforces one pending request per user:
```sql
CREATE UNIQUE INDEX "PhoneChangeRequest_one_pending_per_user"
  ON "PhoneChangeRequest" ("userId") WHERE status = 'PENDING';
```
Catch `P2002` → `PENDING_REQUEST_EXISTS`.

Integration tests must fire concurrent requests with `Promise.all` against a real PostgreSQL and assert the caps hold.

## 9. Listing rules

**Publishable** (checked on activate): all required fields present; ≥ 1 photo; pricing valid; service listings have `serviceMode`; category is active.

**Pricing validation** (Zod `superRefine` + re-checked in service):
- `FIXED`, `STARTING_FROM`: `priceAmount` required, `> 0`, max `9999999999.99`, 2 decimal places.
- `NEGOTIABLE`, `CONTACT_FOR_PRICE`: `priceAmount` must be absent.
- Decimals are serialized in JSON as **strings** (`"15000.00"`). Never convert to float.

**Transitions**

| From | Action | To |
|---|---|---|
| INACTIVE | activate | ACTIVE |
| ACTIVE | deactivate | INACTIVE |
| ACTIVE, INACTIVE | archive | ARCHIVED (set `archivedAt`) |
| ARCHIVED | restore | INACTIVE (clear `archivedAt`) |

Any other transition throws `INVALID_STATE_TRANSITION`. PATCH on an ARCHIVED listing throws the same.

`type` is immutable after creation.

## 10. Locations

- `state` must be one of Nigeria's 36 states or `FCT`, from a canonical constant in `src/lib/locations.ts`. Stored in the canonical spelling.
- `city` is trimmed, whitespace-collapsed free text (max 80). Comparisons for filtering are case-insensitive (`mode: "insensitive"`).
- Service areas: max 10 per listing, unique by `(state, city)`.

## 11. Discovery query

`GET /listings` builds one Prisma `where`:

- `status = ACTIVE` always.
- `type` filter unless `ALL`.
- `category` slug → `category.slug`.
- `q`: split on whitespace (max 5 terms, min length 2). Each term must match at least one of: `title`, `description`, `category.name`, `providerProfile.providerName` (`contains`, insensitive). Terms are ANDed.
- Location: if `state` is given, then
  - PRODUCT: `state` (and `city` if given) equal to the listing's.
  - SERVICE: primary location matches **or** `serviceAreas.some` matches.
- Order: `createdAt desc, id desc`. Offset pagination; response includes `total` and `totalPages`.
- Select only public fields. Contact fields must not be in any `select` used by public queries.
- Later optimization (not MVP): `pg_trgm` GIN indexes if search is slow.

## 12. Images (Cloudinary)

- Wrapper in `src/lib/cloudinary.ts`; the rest of the app never imports the SDK directly.
- `POST /uploads/signature` body `{ purpose: "PROFILE" | "LISTING" }`. Returns `{ cloudName, apiKey, timestamp, folder, uploadPreset, signature }`. The folder is `km/{userId}/profile` or `km/{userId}/listings`. Sign with `cloudinary.utils.api_sign_request`. The API secret never leaves the server.
- Configure the signed upload preset in Cloudinary: allowed formats `jpg, png, webp`, max file size, max dimensions, no unsigned use.
- **Registration check** (`POST …/photos`, profile create/patch): `publicId` must start with the caller's folder prefix. The backend calls `cloudinary.api.resource(publicId)` and verifies format, bytes, dimensions, and that it exists. Then it writes metadata inside the photo-cap transaction.
- On delete: remove the DB row, then call `cloudinary.uploader.destroy`. A failed destroy is logged, not fatal.
- If DB registration fails after upload, destroy the asset best-effort. A periodic orphan sweeper is post-MVP.
- Delivery URLs use transformations (`f_auto,q_auto,w_…`); build them from `publicId` in a helper rather than storing many URLs.

## 13. Contact data and phone numbers

- Validate and normalize phone numbers with `libphonenumber-js`, default region `NG`, stored as E.164.
- Contact data is read only in `providers.service.getContact()`. Public mappers (`toPublicProvider`, `toPublicListing`) are allowlist-based: they build objects field by field and never spread DB rows.
- A test asserts that no public response JSON contains the substrings of the seeded phone and WhatsApp values.
- `GET …/contact` response is sent with `Cache-Control: no-store`.

## 14. Operational scripts (manual review process)

No admin API. Reviewers are operators with database access, working through audited scripts:

- `npm run ops:phone-change -- --id <uuid> --action approve|reject --reviewer <name>`
  - In one transaction: verify status is PENDING; on approve, update `ProviderProfile.phoneNumber`; set request status, `reviewedAt`, `reviewerReference`.
  - Emits a structured audit log line.
- `npm run ops:category-suggestion -- --id <uuid> --action accept|reject --reviewer <name> [--slug <slug>]` (accept can optionally create the Category).
- Scripts live in `src/scripts/`, use the same Prisma client, and are excluded from the HTTP app.

## 15. Logging

- `pino` + `pino-http`; JSON to stdout.
- Redact: `req.headers.cookie`, `req.headers.authorization`, `*.password`, `*.passwordHash`, `*.token`, `*.tokenHash`, `*.phoneNumber`, `*.whatsappNumber`, `*.proposedPhone`.
- Audit events are logged with an `event` field (`auth.login.success`, `auth.login.failure`, `listing.activated`, `phone_change.requested`, and so on) plus `userId` and `requestId`.

## 16. Rate limiting

- `express-rate-limit` with the limits in PRD §11.
- Keys: IP for public endpoints; `userId` for authenticated ones.
- Login: also limit per normalized email (separate limiter) to resist distributed guessing.
- In-memory store in development; Redis store behind an env flag for production (`REDIS_URL`).
- Return the standard error envelope with `RATE_LIMITED`.

## 17. Testing

- **Vitest + Supertest**; tests import `createApp()` from `src/app.ts` (no `listen`).
- Separate test database from `compose.yaml` (service `db-test`, port 5433→5434, DB `kingdom_market_test`). Apply migrations with `prisma migrate deploy`; truncate tables between test files.
- Layout: `tests/unit` (pure functions), `tests/integration` (HTTP + DB), `tests/security` (PRD §14 scenarios), plus factories in `tests/helpers`.
- Mock Cloudinary and Google at the wrapper boundary only.
- Coverage targets: ≥ 85% on services; 100% of the PRD §14 security table.

## 18. Build, Docker, CI

- Multi-stage `Dockerfile`: deps → build (`prisma generate`, `tsc`) → runtime (non-root user, production deps only, `node dist/server.js`). `.dockerignore` excludes `.env`, `node_modules`, `.git`.
- `server.ts` handles `SIGTERM`/`SIGINT`: stop accepting connections, close HTTP server, `prisma.$disconnect()`, exit.
- Scripts in `package.json`: `dev`, `build`, `start`, `lint`, `format`, `typecheck`, `test`, `test:unit`, `test:integration`, `db:up`, `db:down`, `db:generate`, `db:migrate`, `db:deploy`, `db:seed`, `ops:phone-change`, `ops:category-suggestion`.
- GitHub Actions workflow runs PRD §13.4 steps 1–8 with a PostgreSQL service container; migrations and deploy steps are left as documented placeholders until hosting is chosen.

## 19. Assumptions made in this TRD (confirm or change)

1. Google accounts are never auto-linked to existing password accounts in the MVP.
2. State list is a fixed constant; city is free text.
3. Provider may select up to 5 categories.
4. Offset pagination is sufficient.
5. Operators review phone changes and category suggestions through CLI scripts.
6. Owner-side read endpoints (`/providers/me/listings…`) are added to the PRD API because the provider dashboard cannot work without them.
7. Zero-priced FIXED listings are rejected (price must be `> 0`).

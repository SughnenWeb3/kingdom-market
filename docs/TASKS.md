# Kingdom Market: Build Plan

Work **one phase at a time**. At the end of each phase: all checks pass, summarize what was built and any decisions made, then **stop and wait for approval** before starting the next phase.

Every phase must leave `npm run lint`, `npm run typecheck`, and `npm test` green.

## Phase 1: Project setup
- [ ] `npm init`, TypeScript strict config, ESM, ESLint, Prettier, `.nvmrc`, `engines`
- [ ] Folder structure from PRD §4 (empty module folders with placeholder files are fine)
- [ ] `compose.yaml` with `db` (5433) and `db-test` (5434); `.env.example`; `.gitignore`
- [ ] `src/config/env.ts` (Zod, fail fast), `src/lib/logger.ts`, `src/lib/errors.ts`
- [ ] `src/app.ts` (`createApp`) and `src/server.ts` (graceful shutdown)
- [ ] `/health/live`, `/health/ready` (readiness stub until Prisma exists)
- [ ] Scripts in `package.json` per TRD §18

**Done when:** `docker compose up -d db` works, `npm run dev` serves `/api/v1/health/live`, CI-equivalent commands pass.

## Phase 2: Database
- [ ] `prisma.config.ts`, schema from PRD §7, `src/lib/prisma.ts` (adapter-pg)
- [ ] Initial migration, plus raw-SQL migration for the pending-phone partial unique index
- [ ] `seed.ts`: idempotent category upsert (list from PRD §12, slugs stable)
- [ ] `src/lib/locations.ts` (state constants)
- [ ] Readiness endpoint now checks the database
- [ ] Test harness: test DB, migrate, truncate helper, first integration test

**Done when:** a clean database migrates and seeds from scratch; re-running seed changes nothing.

## Phase 3: Auth and security foundation
- [ ] Error handler, validate middleware, request-id, helmet, CORS, rate-limit middleware
- [ ] Email normalization, password validation (byte-length), bcrypt service
- [ ] Session create/lookup/revoke, cookie handling, idle and absolute expiry, hourly purge
- [ ] CSRF middleware (Origin + HMAC token)
- [ ] `register`, `login`, `logout`, `me`
- [ ] Google OIDC flow with PKCE, state, nonce (mock at the wrapper in tests)
- [ ] Tests: duplicate email, generic login error, timing-path parity, session expiry/revocation, CSRF rejection, rate limit 429, no secrets in logs

## Phase 4: Providers
- [x] `POST/GET/PATCH /providers/me`, public profile mapper, contact endpoint
- [x] Phone normalization; `phoneNumber` rejected on PATCH
- [x] Phone-change request endpoint + `ops:phone-change` script
- [x] Cloudinary wrapper + `POST /uploads/signature` + profile image verification (mocked in tests)
- [x] Tests: one profile per user, public response has no contact data, contact requires auth, pending change leaves current number intact, single pending request, ops script approve/reject

## Phase 5: Listings and media
- [ ] Create/update with pricing and type-specific validation
- [ ] Photo add/remove with 5-photo cap (row lock)
- [ ] Lifecycle endpoints with transition table and 10-active cap (provider row lock)
- [ ] Owner read endpoints (`/providers/me/listings…`)
- [ ] Service areas replace-on-patch
- [ ] Tests: IDOR (another user's listing → 404), fake owner ID ignored, 11th activation 409, **concurrent** activation and photo uploads hold caps, archived cannot be activated or edited, activation without photo fails

## Phase 6: Discovery and categories
- [ ] `GET /listings`, `GET /listings/:id` with the query rules in TRD §11
- [ ] `GET /categories`, `POST /category-suggestions`, `ops:category-suggestion` script
- [ ] Tests: ACTIVE only, type/category/state/city filters, service-area match (and non-match), keyword across the four fields, newest-first with stable tie-break, limit cap 50, unknown params rejected

## Phase 7: Hardening and deployment
- [ ] Full PRD §14.3 security table as tests under `tests/security`
- [ ] Dockerfile (multi-stage, non-root), `.dockerignore`
- [ ] GitHub Actions workflow (TRD §18)
- [ ] `README.md`: setup, scripts, env reference, ops procedures, architecture overview
- [ ] Dependency audit, final review against PRD §15 acceptance criteria

**Done when:** every PRD §15 criterion maps to at least one passing test or a documented operational step.

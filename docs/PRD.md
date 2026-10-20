# Kingdom Market: Backend PRD and Technical Specification

Version 1.1 | Web application | Currency: NGN

## 1. Summary

Kingdom Market is a web marketplace where people discover products and services offered by individuals and businesses. It launches for the RCCG youth church community and stays open to the public. Visitors browse without an account; they must sign in to see provider contact details.

The backend is a modular monolith: Express.js, TypeScript, Prisma 7, PostgreSQL (Docker for local development), and Cloudinary for images.

**Principle:** the frontend presents; the backend owns the rules. Listing limits, contact privacy, ownership, and phone-change approval are enforced server-side, even if the UI is bypassed.

## 2. Scope

**In MVP**
- Email/password and Google sign-in; user profiles
- Provider onboarding on the same account, with optional self-declared RCCG youth affiliation
- Product and service listings with photos; predefined categories; category suggestions
- Search by keyword, category, state, city, and service area
- Listing lifecycle (activate, deactivate, archive, restore)
- Authenticated-only contact details
- Manual review of phone-number changes
- Security, logging, migrations, deployment readiness

**Out of MVP** (add only by approved requirement)
Payments, orders, bookings, chat, reviews, favorites, admin dashboard, automated category or phone approval, account deletion, reporting/disputes, price filter, church verification, email verification, password recovery, "Popular Offerings" section.

> Excluding email verification and password recovery is a product decision, not a security best practice. The owner must accept the account-recovery risk before launch and document a support process.

## 3. Stack

| Layer | Choice |
|---|---|
| Runtime / API | Node.js LTS, Express.js, TypeScript |
| Database / ORM | PostgreSQL, Prisma 7 with `@prisma/adapter-pg` and `pg` |
| Auth | bcrypt, server-side sessions, Google OpenID Connect |
| Validation / hardening | Zod, Helmet, express-rate-limit (Redis store if multiple instances) |
| Images | Cloudinary (Node.js SDK) |
| Local DB | Docker Compose |
| Tests | Vitest or Jest with Supertest |

## 4. Architecture

Browser → Express REST API (validation, auth, authorization, business rules) → Prisma → PostgreSQL. Images go to Cloudinary; PostgreSQL stores only metadata.

- PostgreSQL is never publicly reachable.
- Production uses HTTPS, a managed private database, protected secrets, centralized logs/monitoring, and automated backups.

### Project structure

```
kingdom-market-backend/
├── prisma/ (schema.prisma, migrations/, seed.ts)
├── src/
│   ├── app.ts, server.ts
│   ├── config/ (env.ts, security.ts)
│   ├── lib/ (prisma.ts, logger.ts, errors.ts, cloudinary.ts)
│   ├── middleware/ (authenticate, authorize, validate, rate-limit, csrf, error-handler)
│   ├── modules/ (auth, users, providers, listings, categories, discovery,
│   │             phone-change-requests, category-suggestions)
│   └── routes/index.ts
├── tests/ (unit, integration, security)
├── prisma.config.ts, Dockerfile, compose.yaml
└── package.json, tsconfig.json, .env.example, .gitignore, README.md
```

Each module has `.routes`, `.controller`, `.service`, `.schema`, `.types`. Routes attach middleware; controllers handle HTTP; services enforce rules and own database access; schemas validate input.

## 5. Functional Requirements

### 5.1 Accounts
- Register, log in, log out, and fetch the current user, by email/password or Google.
- Emails are normalized identically on store and compare; duplicates are rejected.
- Invalid logins return one generic error.

### 5.2 Provider profiles
One account can be customer, provider, or both. Becoming a provider never creates a second account.

- **Required:** provider/business name, profile photo or logo, short description, state, city, phone, WhatsApp, at least one category.
- **Optional:** RCCG youth affiliation (self-declared, never shown as verified), operating hours, social links.
- Completeness is enforced in the service layer.

### 5.3 Listings
Providers create, edit, activate, deactivate, archive, and restore their own listings.

- **Common required fields:** title, description, category, state, city, pricing option, at least one photo.
- **Product:** discovered by its state and city.
- **Service:** also requires `serviceMode` (REMOTE, IN_PERSON, BOTH); may list additional service areas. Area filtering matches only the primary location plus explicitly configured areas.
- **Pricing:** FIXED and STARTING_FROM require a positive `priceAmount`; NEGOTIABLE and CONTACT_FOR_PRICE omit it. All amounts are NGN `Decimal(12,2)`.
- `serviceMode` is required for services and forbidden for products.

### 5.4 Limits and lifecycle
- Max **10 active listings** per provider (products and services combined). Max **5 photos** per listing.
- A listing needs all required fields and at least one photo to become ACTIVE.
- New listings start INACTIVE.

| Status | Public | Editable | Next |
|---|---|---|---|
| ACTIVE | Yes | Yes | Deactivate, archive |
| INACTIVE | No | Yes | Activate (subject to cap), archive |
| ARCHIVED | No | No | Restore (returns to INACTIVE), then activate |

- Restore returns a listing to INACTIVE. Activation is a separate step that enforces the cap.
- The cap and photo limit are enforced inside a PostgreSQL transaction with row locking or serializable isolation, and tested for concurrent requests.

### 5.5 Discovery
Public endpoint returning ACTIVE listings only.

- Filters: `q` (title, description, category, provider name), `type` (ALL, PRODUCT, SERVICE), `category` (slug), `state`, optional `city`, service-area match.
- Newest first. `page`, `limit` (max 50).

### 5.6 Contact access
- Phone and WhatsApp are returned only by `GET /providers/:providerId/contact`, which requires authentication on every request.
- They never appear in public profiles, listings, search, errors, logs, debug output, or API docs examples.
- Authentication grants no edit rights over other providers.

### 5.7 Phone-number changes
1. Provider submits a request; the proposed number is stored as PENDING.
2. The current approved number stays active.
3. An authorized reviewer approves or rejects through a restricted operational process (no public approval endpoint, no admin dashboard).
4. On approval the profile number updates; on rejection it does not.
5. Only one PENDING request per provider at a time.

Each review records the reviewer, time, and action. Reviewer identity never comes from public request input. Direct database edits are acceptable only as a documented, audited, restricted interim procedure.

### 5.8 Categories
Categories are predefined and seeded. Signed-in users may suggest new ones; suggestions stay PENDING for manual review and never create public categories.

## 6. Business Rules (server-enforced)

1. Only authenticated users manage their own provider profile and listings.
2. Only a listing's owner may edit, deactivate, archive, restore it, or manage its photos.
3. Ownership is derived from the session, never from client-supplied IDs.
4. Only ACTIVE listings are public.
5. Max 10 active listings per provider; max 5 photos per listing; at least 1 photo to be ACTIVE.
6. ARCHIVED listings must be restored before activation.
7. Contact details are served only to authenticated users.
8. Phone changes do not take effect before approval.
9. Category suggestions require authentication and stay pending until reviewed.
10. Money is stored as Decimal in NGN.
11. All input is validated; database access uses Prisma's safe APIs.
12. State and city values are stored consistently (see Open Decisions).

## 7. Database

**Principles:** UUID primary keys, UTC timestamps, foreign keys, indexes on filter columns, unique constraints against duplicates, Decimal for money, transactions for multi-record operations, server-side sessions.

**Entities:** User, OAuthAccount, Session, ProviderProfile, Category, ProviderCategory, Listing, ListingPhoto, ServiceArea, PhoneChangeRequest, CategorySuggestion.

**Relations:** User 1–0..1 ProviderProfile; ProviderProfile 1–N Listing; ProviderProfile N–N Category (via ProviderCategory); Listing N–1 Category; Listing 1–N ListingPhoto (max 5); Listing 1–N ServiceArea; User 1–N Session, OAuthAccount, PhoneChangeRequest, CategorySuggestion.

### Prisma 7 schema

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum ListingType       { PRODUCT SERVICE }
enum ListingStatus     { ACTIVE INACTIVE ARCHIVED }
enum PricingType       { FIXED STARTING_FROM NEGOTIABLE CONTACT_FOR_PRICE }
enum ServiceMode       { REMOTE IN_PERSON BOTH }
enum PhoneChangeStatus { PENDING APPROVED REJECTED }
enum SuggestionStatus  { PENDING REVIEWED ACCEPTED REJECTED }

model User {
  id                  String   @id @default(uuid()) @db.Uuid
  email               String   @unique
  passwordHash        String?
  displayName         String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  providerProfile     ProviderProfile?
  oauthAccounts       OAuthAccount[]
  sessions            Session[]
  categorySuggestions CategorySuggestion[]
  phoneChangeRequests PhoneChangeRequest[]

  @@index([createdAt])
}

model OAuthAccount {
  id                String   @id @default(uuid()) @db.Uuid
  userId            String   @db.Uuid
  provider          String
  providerAccountId String
  createdAt         DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}

model Session {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @db.Uuid
  tokenHash  String   @unique
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  lastSeenAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}

model ProviderProfile {
  id                    String   @id @default(uuid()) @db.Uuid
  userId                String   @unique @db.Uuid
  providerName          String
  description           String
  profileImagePublicId  String
  profileImageUrl       String
  state                 String
  city                  String
  phoneNumber           String
  whatsappNumber        String
  churchAffiliation     String?
  operatingHours        Json?
  socialLinks           Json?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  user       User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  categories ProviderCategory[]
  listings   Listing[]
}

model Category {
  id          String   @id @default(uuid()) @db.Uuid
  name        String   @unique
  slug        String   @unique
  description String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())

  providerCategories ProviderCategory[]
  listings           Listing[]

  @@index([isActive])
}

model ProviderCategory {
  providerProfileId String @db.Uuid
  categoryId        String @db.Uuid

  providerProfile ProviderProfile @relation(fields: [providerProfileId], references: [id], onDelete: Cascade)
  category        Category        @relation(fields: [categoryId], references: [id], onDelete: Restrict)

  @@id([providerProfileId, categoryId])
  @@index([categoryId])
}

model Listing {
  id                String        @id @default(uuid()) @db.Uuid
  providerProfileId String        @db.Uuid
  categoryId        String        @db.Uuid
  type              ListingType
  status            ListingStatus @default(INACTIVE)
  title             String
  description       String
  state             String
  city              String
  pricingType       PricingType
  priceAmount       Decimal?      @db.Decimal(12, 2)
  serviceMode       ServiceMode?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  archivedAt        DateTime?

  providerProfile ProviderProfile @relation(fields: [providerProfileId], references: [id], onDelete: Restrict)
  category        Category        @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  photos          ListingPhoto[]
  serviceAreas    ServiceArea[]

  @@index([status, createdAt])
  @@index([type, status, createdAt])
  @@index([categoryId, status])
  @@index([state, city, status])
  @@index([providerProfileId, status])
}

model ListingPhoto {
  id        String   @id @default(uuid()) @db.Uuid
  listingId String   @db.Uuid
  publicId  String   @unique   // Cloudinary public_id
  secureUrl String
  format    String
  width     Int
  height    Int
  altText   String?
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())

  listing Listing @relation(fields: [listingId], references: [id], onDelete: Cascade)

  @@index([listingId, sortOrder])
}

model ServiceArea {
  id        String   @id @default(uuid()) @db.Uuid
  listingId String   @db.Uuid
  state     String
  city      String
  createdAt DateTime @default(now())

  listing Listing @relation(fields: [listingId], references: [id], onDelete: Cascade)

  @@unique([listingId, state, city])
  @@index([state, city])
}

model PhoneChangeRequest {
  id                String            @id @default(uuid()) @db.Uuid
  userId            String            @db.Uuid
  proposedPhone     String
  status            PhoneChangeStatus @default(PENDING)
  reviewerReference String?
  reviewedAt        DateTime?
  createdAt         DateTime          @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@index([userId, status])
  @@index([status, createdAt])
}

model CategorySuggestion {
  id          String           @id @default(uuid()) @db.Uuid
  userId      String           @db.Uuid
  name        String
  description String?
  status      SuggestionStatus @default(PENDING)
  createdAt   DateTime         @default(now())
  reviewedAt  DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@index([status, createdAt])
  @@index([userId])
}
```

### Implementation notes
1. The connection URL lives in `prisma.config.ts`, not the datasource block. The client import path must match the generator `output`.
2. Rules the schema cannot express are enforced in services: profile completeness, pricing by type, `serviceMode` by type, photo-before-activation.
3. Add a partial unique index in a raw SQL migration to allow one PENDING phone request per user.
4. Do not link a Google identity to an existing password account just because emails match. Use a verified, secure linking flow.
5. Pin compatible Prisma CLI, client, and adapter versions.

## 8. API (`/api/v1`)

JSON over HTTPS. All query, path, and body input is validated. Protected routes use authentication middleware; owned resources get ownership checks.

### Auth
| Method | Path | Access |
|---|---|---|
| POST | `/auth/register` | Public |
| POST | `/auth/login` | Public |
| GET | `/auth/google` | Public |
| GET | `/auth/google/callback` | Public |
| POST | `/auth/logout` | Auth |
| GET | `/auth/me` | Auth |

### Providers
| Method | Path | Access |
|---|---|---|
| POST | `/providers/me` | Auth |
| GET | `/providers/me` | Auth |
| PATCH | `/providers/me` | Auth |
| GET | `/providers/:providerId` | Public (no contact fields) |
| GET | `/providers/:providerId/contact` | Auth |
| POST | `/providers/me/phone-change-requests` | Auth |

### Listings
| Method | Path | Access |
|---|---|---|
| GET | `/listings` | Public |
| GET | `/listings/:listingId` | Public (ACTIVE only) |
| POST | `/listings` | Provider |
| PATCH | `/listings/:listingId` | Owner |
| POST | `/listings/:listingId/activate` | Owner |
| POST | `/listings/:listingId/deactivate` | Owner |
| POST | `/listings/:listingId/archive` | Owner |
| POST | `/listings/:listingId/restore` | Owner |
| POST | `/listings/:listingId/photos` | Owner (registers an uploaded image) |
| DELETE | `/listings/:listingId/photos/:photoId` | Owner |

### Uploads, categories, health
| Method | Path | Access |
|---|---|---|
| POST | `/uploads/signature` | Auth (returns a Cloudinary upload signature) |
| GET | `/categories` | Public |
| POST | `/category-suggestions` | Auth |
| GET | `/health/live` | Public |
| GET | `/health/ready` | Public (minimal output, no internals) |

### Conventions
- **Responses:** `{ "success": true, "data": {...} }` or `{ "success": false, "error": { "code", "message", "details": [{ "field", "message" }] } }`. Never include stack traces, SQL errors, hashes, tokens, or secrets.
- **Status codes:** 200, 201, 204; 400 validation or malformed input; 401 unauthenticated; 403 role or permission failure; 404 missing or not owned (ownership failures return 404 to avoid revealing existence); 409 conflict (duplicate email, listing limit, invalid state transition, photo limit); 413; 415; 429; 500. The API does not use 422.
- **Discovery example:** `GET /listings?type=SERVICE&category=tailoring&state=Plateau&city=Jos&page=1&limit=20`

## 9. Authentication and Sessions

### Registration and passwords
1. Normalize the email, validate the format and the password.
2. Reject duplicates; hash with bcrypt (configurable work factor, minimum 10, default 12).
3. Store only the hash; create the session only after the account is created.

Password policy:
- At least 12 characters and at most 72 **bytes** (bcrypt's limit). Reject over-length input; never truncate silently.
- Reject whitespace-only passwords; no arbitrary complexity rules.
- Never log or return passwords.

### Sessions
- Opaque server-side sessions. The cookie holds a random token; the database stores only its hash.
- Cookie: `HttpOnly`, `Secure` (production), `SameSite=Lax`, `Path=/`. Never use localStorage or URLs.
- Rotate the token on login; revoke on logout and sensitive account events.
- Expiry: 30-minute idle, 7-day absolute. No "remember me". Purge expired sessions periodically.
- CSRF protection on all state-changing cookie-authenticated requests, plus origin checks. SameSite alone is not sufficient.

### Google sign-in
Authorization-code OIDC flow. Validate `state`, nonce, redirect URI, token signature, issuer, audience, and expiry. Use the verified Google `sub` as the external ID; never trust client-supplied email or ID. Keep the client secret server-side. Establish a normal session on success.

## 10. Image Handling (Cloudinary)

Cloudinary stores and delivers images through its CDN. PostgreSQL stores the `public_id`, secure URL, format, dimensions, and owning resource.

**Flow**
1. The client asks `POST /uploads/signature`. The backend authenticates the user, checks the upload limits, and returns a signature scoped to a user-specific folder, allowed formats, and size limit.
2. The client uploads directly to Cloudinary.
3. The client registers the image via `POST /listings/:listingId/photos` (or the provider profile endpoints) with the `public_id`.
4. The backend checks ownership and the 5-photo cap in a transaction, verifies the asset with Cloudinary, and records the metadata. Unregistered uploads are cleaned up.

**Rules**
- Allowed formats: JPEG, PNG, WebP. No SVG.
- Enforce file-size and dimension limits and verify file type server-side; do not trust filenames or MIME headers.
- Users may attach or delete only images on resources they own. Deleting a record also deletes the Cloudinary asset.
- Serve resized, optimized images through Cloudinary transformations.
- Keep `CLOUDINARY_API_SECRET` server-side only; never expose it in frontend code.

## 11. Security

**Application**
- Helmet and a restrictive CSP
- HTTPS enforced in production
- CORS limited to approved frontend origins (CORS is not authentication)
- Body-size limits
- Zod validation on all external input
- Central error handler
- Logs with secrets and personal data redacted
- Dependency and secret scanning

**Authorization (IDOR prevention)**
For every protected resource: authenticate → load → verify ownership against the session's provider profile → act. Never trust a submitted user ID.

**Database**
- Private network, TLS, strong credentials, least-privilege roles, migration permissions separate from app permissions.
- Encrypted, access-restricted backups.
- No secrets in source control; no production data in development.

**Rate limits (initial; tune by traffic)**
| Endpoint | Limit |
|---|---|
| Login | 5 failures / 15 min / IP, plus account-aware controls |
| Registration | 5 / hour / IP |
| Google sign-in start | 20 / 15 min / IP |
| Category suggestions | 5 / hour / user |
| Phone-change requests | 3 / day / user |
| Upload signatures | 20 / hour / user |
| Public search | 100 / min / IP |

**Threats and mitigations:** brute force (bcrypt, throttling, generic errors); session theft (HTTPS, HttpOnly, rotation, revocation); CSRF (tokens, origin checks); XSS (escaping, CSP); SQL injection (Prisma safe APIs); IDOR (ownership checks); contact scraping (auth gate, rate limits, monitoring); malicious uploads (signed uploads, validation); limit race conditions (transactions); credential leakage (secret management, redaction); data loss (tested backups); unauthorized phone review (restricted operators, audit records).

**Audit logging:** auth success/failure, session revocation, profile creation, listing lifecycle events, phone-change submissions and outcomes, repeated authorization failures, rate-limit triggers, server errors. Never log passwords, tokens, OAuth secrets, or database URLs.

## 12. Local Setup (Docker + PostgreSQL)

PostgreSQL runs in Docker; no local install is needed.

**Prerequisites:** Node.js LTS (Prisma 7 compatible), Docker with Compose, Git.

**`compose.yaml`**
```yaml
services:
  db:
    image: postgres:17
    restart: unless-stopped
    environment:
      POSTGRES_DB: kingdom_market
      POSTGRES_USER: km_app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "127.0.0.1:5433:5432"
    volumes:
      - kingdom_market_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U km_app -d kingdom_market"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s
    networks:
      - kingdom_market_network

volumes:
  kingdom_market_pgdata:

networks:
  kingdom_market_network:
    driver: bridge
```

The port is bound to localhost only. Never publish a database port in production. If the API also runs in Compose, use `db:5432` as the host.

**`.env.example`** (copy to `.env`; never commit it)
```
NODE_ENV=development
PORT=4000
POSTGRES_PASSWORD=replace_with_a_local_development_password
DATABASE_URL=postgresql://km_app:replace_with_a_local_development_password@localhost:5433/kingdom_market?schema=public
SESSION_COOKIE_NAME=km_session
SESSION_IDLE_TIMEOUT_MINUTES=30
SESSION_ABSOLUTE_TIMEOUT_DAYS=7
BCRYPT_ROUNDS=12
FRONTEND_URL=http://localhost:3000
API_BASE_URL=http://localhost:4000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:4000/api/v1/auth/google/callback
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

**Commands**
```
docker compose up -d db          # start
docker compose ps                # status
docker compose logs -f db        # logs
docker compose down              # stop, keep data
docker compose down -v           # stop AND delete data (intentional only)
```

**Prisma 7**
```
npm install express bcrypt zod helmet cors express-rate-limit cookie-parser dotenv pg \
  @prisma/adapter-pg @prisma/client cloudinary
npm install -D prisma typescript tsx @types/node @types/express @types/bcrypt @types/cookie-parser

npx prisma generate
npx prisma migrate dev --name init   # development
npx prisma migrate deploy            # production; never use `db push` in production
```

`prisma.config.ts`
```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: env("DATABASE_URL") },
});
```

`src/lib/prisma.ts` (one shared client per process; adjust the import path to the generator output)
```ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
```

**Seed:** idempotent `upsert` of predefined categories by slug. The final taxonomy must be agreed before production seeding.

## 13. Deployment and Operations

- Separate configuration and secrets for development, test, staging, and production.
- Production needs HTTPS termination, a supported Node.js runtime, a private managed PostgreSQL, Cloudinary credentials in a secrets manager, health checks, centralized logs and error monitoring, and automated backups.
- **Container:** pinned Node base image, non-root user, production dependencies only, `.dockerignore`, no `.env` or secrets in layers, graceful shutdown, logs to stdout/stderr.
- **CI/CD:** install from the lockfile → lint and format → type-check → generate the Prisma client → unit tests → integration tests on PostgreSQL → dependency and secret scans → build image → deploy to staging → apply reviewed migrations → smoke tests → approved production deploy → verify health and monitoring.
- Use expand-and-contract for breaking schema changes.
- **Backups:** define frequency, retention, encryption, restore permissions, RPO, RTO, and restoration drills. A backup is unreliable until a restore has been tested.
- **Monitoring:** availability, latency, error rate, database connections and storage, auth-failure spikes, rate-limit triggers, upload failures, migration failures, backup status. `/health/live` shows the process is up; `/health/ready` also checks the database.

## 14. Testing

**Unit:** password rules and hashing, email normalization, listing and pricing validation, status transitions, profile validation, permission checks.

**Integration** (real PostgreSQL via Docker): registration/login, session lifecycle, Google callback validation, provider onboarding, listing CRUD and lifecycle, photo add/remove, discovery filters, contact gating, phone-change requests, category suggestions, transaction rollback.

**Security (must pass)**
| Scenario | Expected |
|---|---|
| Visitor requests contact details | 401 |
| User edits another provider's listing | 404 |
| Fake owner ID submitted | Ignored; session decides ownership |
| 11th active listing | 409 |
| Concurrent activations exceed cap | Cap holds |
| 6th photo, including concurrent uploads | 409 |
| Public responses | No contact fields |
| Invalid or expired session | 401 |
| Repeated login abuse | 429 |
| Disguised or unsupported upload | Rejected |
| Pending phone change | Old number stays active |
| Public phone approval attempt | No such endpoint |
| Database down | Readiness fails safely |

**End-to-end:** visitor searches and filters → opens a listing → is prompted to sign in for contact → registers → becomes a provider → creates a listing with a photo → activates → listing appears publicly → provider edits or deactivates → submits a phone change → old number unchanged until reviewed.

## 15. Acceptance Criteria

- **Auth:** registration, bcrypt hashing, duplicate rejection, secure Google sign-in, revocable server-side sessions, auth rate limits, no password or token in logs.
- **Providers:** one profile per user, required fields validated, affiliation never shown as verified, public profiles hide contact, phone changes stay pending until approved.
- **Listings:** owner-only management, photo and field requirements before activation, 5-photo and 10-active limits safe under concurrency, archived listings need restoration, only ACTIVE listings are public.
- **Discovery:** keyword, type, category, state, city, and service-area filters work; newest-first; pagination capped at 50.
- **Security and deployment:** server-side authN/authZ, contact gate, CSRF, CORS, headers, validation, rate limits, private database, no secrets in source or images, clean-environment migrations, passing tests, restored-backup drill, working health checks, monitoring, and logging.

## 16. Implementation Order

1. Project setup: Express/TypeScript, Docker PostgreSQL, env, Prisma 7
2. Schema, migrations, seed, database tests
3. Auth foundation: registration, bcrypt, Google, sessions, rate limiting, CSRF, error handling
4. Providers: profiles, categories, contact gate, phone-change requests
5. Listings and media: pricing, service areas, lifecycle, concurrency-safe limits, Cloudinary uploads
6. Discovery, categories, category suggestions
7. Security tests, CI/CD, production config, backups, launch checks

Start with 1–2, and build authentication and authorization before any marketplace feature.

## 17. Open Decisions Before Production

1. Hosting providers for frontend and API
2. Frontend and API on the same site or different sites (affects cookie and CSRF setup)
3. Who reviews phone changes and category suggestions, and through what restricted process
4. Account-recovery support process
5. Location taxonomy: predefined dataset, normalized tables, or validated text
6. Exact label for self-declared RCCG youth affiliation
7. Whether zero-priced FIXED listings are allowed
8. Whether the 10-active-listing cap suits launch
9. Retention periods for sessions, logs, and review records
10. Production database roles and migration permissions
11. Exact pinned Prisma 7 versions

## 18. References

Prisma 7 docs, Prisma PostgreSQL adapter, Prisma config reference, Cloudinary Node.js SDK, OWASP Password Storage, Authentication, Session Management, and Database Security cheat sheets, Docker Compose healthchecks, Express production best practices.

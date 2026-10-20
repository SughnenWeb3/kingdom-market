# Kingdom Market: API Contract

Base path `/api/v1`. JSON only. Envelope and error codes: see `docs/TRD.md` §5. All state-changing requests need `Origin` matching the frontend, and authenticated ones need `X-CSRF-Token`.

Legend: 🔓 public · 🔐 session required · 👤 provider profile required · 🔑 owner of resource

Common types:
- `Money`: string, 2 decimals, e.g. `"15000.00"`; currency is always NGN.
- `Pagination`: `{ items, page, limit, total, totalPages }`.
- `CategoryRef`: `{ id, name, slug }`.

## Auth

### POST /auth/register 🔓
Body: `{ email, password, displayName? }`
- `email`: valid email ≤ 254; `password`: 12+ chars, ≤ 72 bytes; `displayName`: 1–60.
- 201 → `{ user, csrfToken }` and sets session cookie. Errors: 400, 409 `EMAIL_TAKEN`, 429.

### POST /auth/login 🔓
Body: `{ email, password }`
- 200 → `{ user, csrfToken }`. 401 `INVALID_CREDENTIALS` for any failure. 429.

### GET /auth/google 🔓 · GET /auth/google/callback 🔓
- `/auth/google`: 302 to Google; sets the signed flow cookie.
- `/auth/google/callback`: validates `state`, `nonce`, PKCE and ID token; creates session; 302 to `FRONTEND_URL` (success) or `FRONTEND_URL/auth/error?code=<CODE>` (failure, including `ACCOUNT_EXISTS`).

### POST /auth/logout 🔐
- 204; session deleted, cookie cleared.

### GET /auth/me 🔐
- 200 → `{ user, csrfToken }`.
- `user`: `{ id, email, displayName, hasProviderProfile, providerId | null }`.

## Providers

### POST /providers/me 🔐
Body:
```
providerName        2–80
description         10–500
profileImagePublicId  string (must be under caller's Cloudinary folder)
state               canonical state
city                1–80
phoneNumber         NG phone, normalized to E.164
whatsappNumber      NG phone
categoryIds         uuid[] 1–5, active categories
churchAffiliation?  ≤ 80
operatingHours?     object (see below)
socialLinks?        { instagram?, facebook?, x?, tiktok?, website? } valid https URLs
```
- `operatingHours`: `{ mon..sun: { open: "HH:mm", close: "HH:mm" } | null }`.
- 201 → own provider object. 409 `PROVIDER_EXISTS`.

### GET /providers/me 🔐👤
- 200 → own provider (includes `phoneNumber`, `whatsappNumber`, `pendingPhoneChange: { id, proposedPhone, createdAt } | null`).

### PATCH /providers/me 🔐👤
Body: any subset of the POST fields **except `phoneNumber`** (phone changes go through the request endpoint). `profileImagePublicId` replaces the image (old asset destroyed).
- 200 → own provider.
- A body containing `phoneNumber` → 400 with message pointing to the phone-change endpoint.

### GET /providers/:providerId 🔓
- 200 → `{ id, providerName, description, profileImageUrl, state, city, churchAffiliation, operatingHours, socialLinks, categories: CategoryRef[], activeListingCount, createdAt }`. **No phone or WhatsApp.**

### GET /providers/:providerId/contact 🔐
- 200 → `{ providerId, phoneNumber, whatsappNumber }` with `Cache-Control: no-store`. 401 if unauthenticated. 404 if provider missing.

### POST /providers/me/phone-change-requests 🔐👤
Body: `{ proposedPhone }`
- 201 → `{ id, proposedPhone, status: "PENDING", createdAt }`.
- 409 `PENDING_REQUEST_EXISTS`. 400 if same as current number.

### GET /providers/me/listings 🔐👤
Query: `status?` (ACTIVE|INACTIVE|ARCHIVED), `page`, `limit` (default 20, max 50).
- 200 → `Pagination` of owner listings (includes `status`, `archivedAt`).

### GET /providers/me/listings/:listingId 🔐👤🔑
- 200 → owner listing, any status. 404 if not owned.

## Listings

### Listing public shape
```
{ id, type, title, description, category: CategoryRef,
  state, city, pricingType, priceAmount: Money|null, currency: "NGN",
  serviceMode: "REMOTE"|"IN_PERSON"|"BOTH"|null,
  serviceAreas: [{ state, city }],
  photos: [{ id, url, altText, sortOrder }],
  provider: { id, providerName, profileImageUrl },
  createdAt }
```
Owner shape adds `status`, `archivedAt`, `updatedAt`, and `photos[].publicId`.

### GET /listings 🔓
Query: `q?`, `type?` (ALL|PRODUCT|SERVICE, default ALL), `category?` (slug), `state?`, `city?`, `page?` (≥1, default 1), `limit?` (1–50, default 20).
- 200 → `Pagination` of public listings, newest first. Unknown params are rejected with 400.

### GET /listings/:listingId 🔓
- 200 → public listing if ACTIVE, else 404.

### POST /listings 🔐👤
Body:
```
type          PRODUCT | SERVICE
title         3–100
description   10–2000
categoryId    uuid (active)
state, city
pricingType, priceAmount?   see TRD §9
serviceMode?  required iff SERVICE, forbidden iff PRODUCT
serviceAreas? [{ state, city }] max 10, SERVICE only
```
- 201 → owner listing with `status: "INACTIVE"` and no photos. Photos are added next, then the listing is activated.

### PATCH /listings/:listingId 🔐👤🔑
Body: any subset of the POST fields except `type`. `serviceAreas`, when present, replaces the full set.
- 200 → owner listing. 409 if ARCHIVED.

### POST /listings/:listingId/activate 🔐👤🔑
- 200 → owner listing. 409 `LISTING_LIMIT_REACHED` | `INVALID_STATE_TRANSITION`; 400 `VALIDATION_ERROR` with `details` listing what is missing (e.g. no photo).

### POST /listings/:listingId/deactivate · /archive · /restore 🔐👤🔑
- 200 → owner listing. 409 `INVALID_STATE_TRANSITION` per TRD §9.

### POST /listings/:listingId/photos 🔐👤🔑
Body: `{ publicId, altText?, sortOrder? }`
- 201 → photo. 409 `PHOTO_LIMIT_REACHED`. 400 if the asset is missing, not under the caller's folder, or fails format/size checks.

### DELETE /listings/:listingId/photos/:photoId 🔐👤🔑
- 204. 409 `INVALID_STATE_TRANSITION` if deleting the last photo of an ACTIVE listing (deactivate first).

## Uploads

### POST /uploads/signature 🔐
Body: `{ purpose: "PROFILE" | "LISTING" }`
- 200 → `{ cloudName, apiKey, timestamp, folder, uploadPreset, signature }`. Rate limited (20/hour/user).

## Categories

### GET /categories 🔓
- 200 → `CategoryRef[]` plus `description`, active only, sorted by name.

### POST /category-suggestions 🔐
Body: `{ name (2–60), description? (≤300) }`
- 201 → `{ id, name, status: "PENDING", createdAt }`. Rate limited (5/hour/user).

## Health

- `GET /health/live` → 200 `{ status: "ok" }`.
- `GET /health/ready` → 200 `{ status: "ready" }` if `SELECT 1` succeeds, else 503 `{ status: "unavailable" }`. No details.

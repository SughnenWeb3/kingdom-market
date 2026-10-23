# Postman: Phase 4 provider API

Base URL: `http://localhost:3000/api/v1`

Start the API with `npm run dev`. Postman must retain cookies for this base URL (enabled by default). Every `POST` or `PATCH` request needs:

```http
Origin: http://localhost:5173
```

Authenticated state-changing requests also need:

```http
X-CSRF-Token: <csrfToken from register, login, or GET /auth/me>
```

Responses use `{ "success": true, "data": ... }`; errors use `{ "success": false, "error": { "code", "message", "details?" } }`.

## 1. Create a session

### Register

`POST /auth/register`

```json
{
  "email": "provider@example.com",
  "password": "a-long-password-12!",
  "displayName": "Grace Provider"
}
```

Copy `data.csrfToken` into a Postman environment variable named `csrfToken`. The `km_session` cookie is set automatically.

Alternatively, use `POST /auth/login` with the same `Origin` header and copy its `data.csrfToken`.

## 2. Get a category ID

Provider onboarding requires one to five active category UUIDs. The public categories endpoint is Phase 6, so seed and inspect categories locally:

```bash
npm run db:seed
npx prisma studio
```

Open the `Category` table in Prisma Studio and copy an active category `id` into a Postman variable named `categoryId`.

## 3. Upload a profile image to Cloudinary

### Request an upload signature

`POST /uploads/signature`

Headers: `Origin`, `X-CSRF-Token: {{csrfToken}}`

```json
{ "purpose": "PROFILE" }
```

The response includes `cloudName`, `apiKey`, `timestamp`, `folder`, `uploadPreset`, and `signature`. Upload directly to Cloudinary using those values and a JPEG, PNG, or WebP file. Save Cloudinary's returned `public_id` as `profileImagePublicId`.

The returned `public_id` must begin with the returned `folder` plus `/`. The asset must comply with the configured signed preset's size and dimension limits.

## 4. Create the provider profile

`POST /providers/me`

Headers: `Origin`, `X-CSRF-Token: {{csrfToken}}`

```json
{
  "providerName": "Grace Catering",
  "description": "Homemade meals and dependable event catering in Lagos.",
  "profileImagePublicId": "km/<your-user-id>/profile/avatar",
  "state": "Lagos",
  "city": "Ikeja",
  "phoneNumber": "08031234567",
  "whatsappNumber": "+2348037654321",
  "categoryIds": ["{{categoryId}}"],
  "churchAffiliation": "RCCG Youth",
  "operatingHours": {
    "mon": { "open": "09:00", "close": "17:00" },
    "tue": { "open": "09:00", "close": "17:00" },
    "wed": { "open": "09:00", "close": "17:00" },
    "thu": { "open": "09:00", "close": "17:00" },
    "fri": { "open": "09:00", "close": "17:00" },
    "sat": null,
    "sun": null
  },
  "socialLinks": {
    "website": "https://example.com"
  }
}
```

Save `data.id` as `providerId`. The response normalizes phone numbers to E.164.

## 5. Read and update the profile

- `GET /providers/me` returns the private profile, including phone, WhatsApp, and a pending phone-change summary.
- `PATCH /providers/me` updates supplied editable fields. Include `Origin` and `X-CSRF-Token`.

Example update:

```json
{
  "city": "Yaba",
  "socialLinks": { "instagram": "https://instagram.com/gracecatering" }
}
```

Sending `phoneNumber` to this endpoint deliberately returns `400`; use the phone-change endpoint instead.

## 6. Verify public-contact privacy

- `GET /providers/{{providerId}}` is public. Its JSON must not contain a phone or WhatsApp number.
- `GET /providers/{{providerId}}/contact` requires the session cookie. It returns contact fields with `Cache-Control: no-store`.
- Try the contact endpoint in a new Postman session without the cookie: it must return `401 UNAUTHENTICATED`.

## 7. Request a phone change

`POST /providers/me/phone-change-requests`

Headers: `Origin`, `X-CSRF-Token: {{csrfToken}}`

```json
{ "proposedPhone": "08031230000" }
```

The current profile phone stays unchanged until an operator reviews the request. A second pending request returns `409 PENDING_REQUEST_EXISTS`; sending the current phone returns `400`.

## 8. Review a phone change (operator only)

This is intentionally not an HTTP endpoint.

```bash
npm run ops:phone-change -- --id <request-uuid> --action approve --reviewer "Operations Team"
```

Use `--action reject` to reject it. The command exits nonzero for malformed IDs, missing/invalid arguments, unknown requests, and already-reviewed requests. It does not print phone values.

## Useful negative checks

- Create a second provider profile from the same signed-in account: `409 PROVIDER_EXISTS`.
- Use a profile image from another user's Cloudinary folder: `400`.
- Submit an inactive or unknown category ID: `400`.
- Request more than 20 upload signatures in one hour: `429 RATE_LIMITED`.
- Request more than 3 phone changes in one day: `429 RATE_LIMITED`.

# 4-Layer Admin Gate

Admin routes are gated by four sequential checks. A stolen JWT alone is
not enough to act as admin. Each layer fails closed and emits a distinct
error code so client-side UI can render the right next step.

```
        Request to /api/v1/admin/*
                  │
                  ▼
  ┌─────────────────────────────────┐
  │ 1. JWT signature + expiry        │   401 UNAUTHENTICATED
  └──────────────┬──────────────────┘   if missing / expired / forged
                 │
                 ▼
  ┌─────────────────────────────────┐
  │ 2. role ∈ {admin, moderator}     │   403 FORBIDDEN
  └──────────────┬──────────────────┘   if role insufficient
                 │
                 ▼
  ┌─────────────────────────────────┐
  │ 3. 2FA verified within session   │   403 TWO_FACTOR_REQUIRED
  └──────────────┬──────────────────┘   if TOTP step skipped
                 │
                 ▼
  ┌─────────────────────────────────┐
  │ 4. X-Admin-Passkey-Token valid   │   403 PASSKEY_REQUIRED
  └──────────────┬──────────────────┘   if PIN gate not cleared
                 │
                 ▼
              Allowed
```

## Why four layers?

The first three are standard. The fourth — the passkey/PIN — covers a
specific threat: a long-lived admin session is left open on a logged-in
device. Anyone who walks up and uses the browser inherits that session.
The passkey forces a fresh 6-digit-PIN entry every ~15 minutes for any
*write* action against admin endpoints.

The PIN itself is stored as an Argon2id hash on the admin's user row. On
verify, the server issues a short-lived (~15-minute) `passkey_token` —
opaque, server-signed, kept in memory by the SPA. Subsequent admin
write requests carry it as `X-Admin-Passkey-Token`.

## Storage choice

| Item | Where | Why |
|---|---|---|
| Admin PIN hash | `users.admin_passkey_hash` (Argon2id) | Same table, same backup, same migration path |
| Passkey token | In-memory on the API side, signed JWT-like | No DB round-trip per admin write |
| 2FA secret | `users.totp_secret` (encrypted at rest) | TOTP standard |

The passkey token format is essentially a short-TTL JWT signed by a
secret distinct from the access-token JWT secret. Separate keys mean
compromise of one doesn't cascade.

## Rate limit

PIN verify has its own per-user-per-minute limit (3 attempts/minute,
locks for 15 minutes on the 4th failure). Argon2id is intentionally
slow so brute force is uneconomical, but the rate limit is cheap
defence-in-depth.

## Why not WebAuthn?

WebAuthn / passkeys (the FIDO2 kind) would be stronger and was the
original plan. Two pragmatic reasons we ended up with a 6-digit PIN:

1. Admin staff actively use multiple devices and screen-shared sessions
   for ops work. Passkey-per-device with attestation is friction.
2. The PIN gate exists in addition to TOTP, not instead of. Both
   together raise the bar enough for the current threat model. The
   route is open for a WebAuthn migration later.

## See also

[`middleware.ts`](middleware.ts) — sanitized excerpt of the Express
middleware that enforces the chain.

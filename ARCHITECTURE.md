# Architecture Overview

A condensed map of the production system. Generic enough that nothing in here
is competitively sensitive; specific enough to be a useful read.

---

## Stack

```
┌───────────────────────────────────────────────────────────────┐
│                       Cloudflare CDN                          │
│           (TLS termination, edge cache, WAF, RUM)             │
└─────────────────────────┬─────────────────────────────────────┘
                          │
┌─────────────────────────▼─────────────────────────────────────┐
│  Nginx (reverse proxy, gzip, security headers, /uploads)      │
└───────┬──────────────────────────────────┬────────────────────┘
        │ /                                │ /api/v1
┌───────▼────────┐                ┌────────▼──────────┐
│ Frontend (SPA) │                │ Backend (Node.js) │
│ React 18 + TS  │                │ Express + Socket  │
│ Vite + Redux   │                │ Argon2id + JWT    │
│ Tailwind CSS   │                │ DOMPurify         │
│ Service Worker │                │ Rate limiting     │
└────────────────┘                └─┬─────────────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                │                   │                   │
        ┌───────▼────────┐  ┌───────▼────────┐ ┌────────▼────────┐
        │   MySQL 8      │  │   Redis 7      │ │  File storage   │
        │   (InnoDB)     │  │   (cache,      │ │  (uploads/,     │
        │                │  │   sessions)    │ │   volume)       │
        └────────────────┘  └────────────────┘ └─────────────────┘
```

Mobile companion app: React Native + Expo SDK, 100+ navigation routes,
push notification infrastructure.

---

## Key design decisions

### Stateless API
Every request carries its own `Authorization: Bearer <JWT>`. Sessions live
in Redis only as opt-in caches, never as the source of truth. This is what
makes horizontal scaling cheap — spin up another API container, point the
load balancer at it, done.

### Refresh tokens in httpOnly cookies, access tokens in memory
Access tokens are short-lived (24h) and held in JS-readable storage so
the client can attach them to API calls. Refresh tokens are 30-day, sent
as `HttpOnly; SameSite=Strict; Secure` cookies — invisible to XSS, sent
only to `/api/v1/auth/refresh`. This is the standard split that minimizes
blast radius of an XSS.

### Tamper-evident audit log
Every admin action is hash-chained: each row stores `prev_hash` and
`entry_hash`, computed over a canonical JSON of the row plus the previous
row's hash. A periodic verifier walks the chain and shouts if any link
is broken. See [`snippets/audit-log/`](snippets/audit-log/).

### Strict HTTP CSP, no inline scripts
The HTTP `Content-Security-Policy` header omits `'unsafe-inline'` for
`script-src`. Every JS that needs to run at HTML parse time (analytics
gate, PWA prompt capture, service worker registration) lives in a
separate file under `/public/*.js`. This kills entire classes of XSS.
See [`snippets/csp-hardening/`](snippets/csp-hardening/).

### 4-layer admin gate
Admins go through: JWT → role check → TOTP 2FA → 6-digit PIN. The PIN
gives a separate short-lived passkey token that admin-only API routes
require in an `X-Admin-Passkey-Token` header. Even a stolen admin JWT
isn't enough on its own. See [`snippets/admin-gate/`](snippets/admin-gate/).

---

## Scaling playbook (truthful)

Current single-node configuration comfortably serves the target user range
(low-thousands MAU). The architecture is **designed** for horizontal scaling
but has not been load-tested at 100K+ users.

What's already in place for growth:
- **Stateless API** behind a load balancer
- **Redis** caching layer for feed/session data
- **Cloudflare** edge caching for static assets
- **MySQL** primary with documented read-replica topology
- **Docker Compose** today; k8s manifests are a straightforward port

What's deferred until traffic justifies it:
- Real k8s deploy
- MySQL read replicas
- Object storage migration (S3 / R2) for uploads
- ELK / OpenTelemetry stack for proper observability
- Multi-region

---

## Security headers (production)

```http
Content-Security-Policy: default-src 'self'; script-src 'self' https://...; ...
Strict-Transport-Security: max-age=15552000; includeSubDomains; preload
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(self), geolocation=(self), microphone=(self), ...
```

Verified:
- SQL injection → 422 at the validation layer
- IDOR → 404 (ownership check)
- Login rate limit → 429 after 6 attempts
- No PII (email, last IP) returned in public user / post serializers

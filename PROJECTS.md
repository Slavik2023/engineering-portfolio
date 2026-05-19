# Project Portfolio — Systems Architected, Shipped, and Operated

Five production-grade systems I designed end-to-end over ~12 months of
AI-assisted development. This page is about **architectural decisions
and scale**, not about products. Domains, users, and business mechanics
are intentionally omitted — the point is engineering judgement, not
marketing.

This is the wider context behind the snippets and case studies in this
repository. **The deep-dives in [`snippets/`](snippets/) come from
Project #1.** The other four share the same engineering discipline.

---

## 1. Largest System — Consumer-Scale Platform

| | |
|---|---|
| **Codebase** | ~100K LOC · TypeScript end-to-end |
| **Surfaces** | Web SPA · admin panel · React Native (108 routes) |
| **API** | ~200 REST endpoints · Socket.IO real-time gateway |
| **Database** | 100+ MySQL migrations · Redis cache layer |
| **Admin** | 80+ admin pages with row-locking moderation flows |
| **Stack** | React 18 + TypeScript + Vite + Redux Toolkit + Tailwind · Node.js + Express + MySQL 8 + Redis 7 · Socket.IO · Docker Compose · React Native (Expo) · Nginx + Cloudflare CDN |

**Architectural decisions I owned:**
- Designed the tamper-evident hash-chained audit log from scratch.
  Five database migrations were needed to close a concurrent-write
  race; the final pattern (sentinel row + transaction lock under READ
  COMMITTED) was my call. Verified 28,601 production entries with zero
  chain breaks. Full write-up in
  [`case-studies/hash-chain-race.md`](case-studies/hash-chain-race.md).
- Designed the 4-layer admin gate: JWT → role → 2FA → Argon2id-hashed
  6-digit PIN with a TTL-bound passkey token. Rejected WebAuthn for
  pragmatic operational reasons (admin uses screen-sharing); migration
  path stays open.
  [`snippets/admin-gate/`](snippets/admin-gate/).
- Designed the strict-CSP regime: no `'unsafe-inline'` in `script-src`,
  every bootstrap script externalised to `/public/*.js`. Caught a real
  incident — a silently-dropped GDPR consent gate that was loading
  Cloudflare RUM before user opt-in.
  [`case-studies/csp-silent-block.md`](case-studies/csp-silent-block.md).
- Designed real-time cross-flow moderation: admin action → audit log
  → DB commit → Socket.IO fan-out → user feed updates within ~50ms.
  Decision to push event hints, not full payloads, so clients reconcile
  via the next fetch (idempotent client handlers).
- **Status:** Live in production.

---

## 2. Multi-Tenant SaaS — Enterprise Architecture

| | |
|---|---|
| **Topology** | Nx monorepo · `apps/api` + `apps/web` + `apps/mobile` + shared libs |
| **API** | Controller pattern · TypeORM migrations + seeders + clear-and-reseed pipeline |
| **Storage** | MySQL primary · Redis cache · MinIO (S3-compatible object storage) |
| **Frontend** | Next.js (App Router) · React Native mobile companion |
| **Tenancy** | Row-level isolation · 7-role access matrix (5 customer tiers + 2 admin tiers) |

**Architectural decisions I owned:**
- Designed multi-tenant row-level isolation with a tenancy guard in the
  data layer. Tenants never leak across rows even on dev mistakes —
  the constraint is enforced at the repository abstraction, not just
  in controllers.
- Designed an S3-style storage abstraction over MinIO. Dev uses local
  MinIO; production can swap in AWS S3, Cloudflare R2, or Backblaze B2
  without touching application code.
- Chose **Nx monorepo** over polyrepo for shared types, shared lint,
  and atomic refactors across api/web/mobile. Trade-off acknowledged:
  CI takes longer on the first cold cache; payoff is that contract
  drift between client and server is mechanically impossible.
- Designed two deployment modes: single-node Docker Compose for early
  customers, microservices-split `docker-compose.microservices.yml`
  for when traffic justifies it. Switch is configuration, not rewrite.
- **Status:** Deployed, demo accounts live.

---

## 3. Multi-Surface Content Platform — 3 Deployable Apps, One API

| | |
|---|---|
| **Surfaces** | 3 independent deployments — public web · admin SPA · React Native mobile |
| **Backend** | Express + MySQL · single API contract powering all three clients |
| **Roles** | 3-tier permission model (User / Admin / SuperAdmin) |

**Architectural decisions I owned:**
- Decided to deploy the **admin SPA on a separate host** from the
  public-facing app. Content editors work on a different domain;
  if the public surface gets DDOS'd or scaled down, admin operations
  continue unaffected. Trade-off: one more Docker container, one more
  TLS certificate. Worth it for operational isolation.
- Chose **git-driven content release** over an in-DB CMS workflow.
  Editors commit; CI deploys. Smaller surface area for content bugs,
  full version history, easy rollback.
- One API contract reused across web, admin, and mobile — clients
  differ only in which endpoints they call, not in how they call them.
- **Status:** Deployed, demo accounts live.

---

## 4. Real-Time Multi-Client Backend — 4 Deployable Surfaces

| | |
|---|---|
| **Surfaces** | 4 independent clients — API · web · admin · React Native mobile |
| **Stack** | Express + MySQL + Redis · React 18 (web + admin) · React Native (mobile) · Docker Compose with isolated network |

**Architectural decisions I owned:**
- Designed a single auth + session + storage layer reused across all
  four surfaces. Adding a new client (a CLI, a partner integration)
  is a documentation change, not a backend change.
- Chose an **isolated Docker network** per project on the shared host.
  Containers from this project can't talk to containers from another
  project on the same VPS even if hostnames collide. Defensive isolation.
- Designed the admin surface as a thin client over the same API the
  end-user clients consume — admin doesn't have privileged endpoints,
  it has a privileged role. Simpler attack surface to reason about.
- **Status:** Deployed.

---

## 5. R&D Web Application — Custom Simulation Engine

A from-scratch architecture with a bleeding-edge stack chosen
deliberately. Validates a real production design for React 19 + Next 15
+ a custom domain-specific simulation engine.

| | |
|---|---|
| **Topology** | pnpm workspaces monorepo — `apps/server`, `apps/web`, `packages/db`, `packages/engine`, `packages/schemas`, `packages/types` |
| **Backend** | Fastify 5 · Drizzle ORM · MySQL |
| **Frontend** | Next.js 15 (App Router) · React 19 · Three.js |

**Architectural decisions I owned:**
- Split the simulation engine into its **own package**, consumable by
  both server (authoritative state) and client (preview/visualisation).
  Engine has zero knowledge of HTTP, DB, or transport — pure inputs
  to outputs. This is the architectural call I'm proudest of in this
  project: it means the engine can be unit-tested in isolation and
  replaced wholesale if the domain model changes.
- Designed a **shared schema package** (`packages/schemas`) that both
  client and server import. Wire-level contract is type-safe end-to-end;
  a breaking change to one shape is a compile error on both sides.
- Chose Fastify over Express for raw throughput and lower allocation
  overhead — this backend will fan out simulation events at high rates.
- Sprint-driven build with explicit acceptance criteria per sprint.
  Each sprint lands a working slice, not a half-implemented feature.
- **Status:** Engine architecture and DB schema landed. World rendering
  and core interaction loop next.

---

## What this signals

**Architecture, not just code**
- Five systems designed from architecture down — choice of monorepo
  vs polyrepo, of microservices-ready vs single-node, of row-level
  tenancy vs schema-per-tenant, of shared auth vs per-client auth,
  of engine-as-package vs engine-as-service.
- Trade-offs identified and documented in each project, not papered
  over.

**Stack range — engineering, not stack-loyalty**
- API frameworks: Express, Fastify, NestJS-pattern controllers
- ORMs: TypeORM, Drizzle, raw SQL with prepared statements
- Frontend: React 18 + React 19 · Next.js (Pages and App Router) · Vite · React Native (Expo)
- Data: MySQL · Redis · MinIO (S3-compatible)
- Infrastructure: Docker Compose · Cloudflare CDN · Nginx · Certbot SSL · k8s-ready abstractions
- Real-time: Socket.IO · raw WebSocket
- Build tooling: Nx · pnpm workspaces · Vite · Webpack

Comfortable picking the right tool per project rather than defaulting
to the same stack everywhere.

**Output**
- 4 systems deployed and running today
- 1 in active engine-level development
- 13 deployable surfaces total (web + admin + mobile + API across the
  five projects)
- ~100K LOC in the largest system alone

**AI-assisted, not AI-generated**
- Every project survived real production incidents — the kind that
  take five migrations to close (see
  [`case-studies/`](case-studies/)).
- The AI multiplied output. The architectural judgement, the trade-off
  calls, the incident response — those are mine.

**Operationally honest**
- This list does not include side-project stubs or open-source clones.
- Each project is a system I architected end-to-end and own the
  operational result for.

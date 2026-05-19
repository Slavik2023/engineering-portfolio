# Project Portfolio

Five production-grade projects shipped over ~12 months of AI-assisted
development. Each one is its own product with its own domain model and
deployment. Anonymised — names, domains, and identifiers omitted; the
point here is breadth and depth of work, not advertising.

This is the wider context behind the snippets and case studies in this
repository. **The audit-log / PWA-install / CSP-hardening showcases in
[`snippets/`](snippets/) come from Project #1** (the largest one). The
other four projects share the same engineering discipline.

---

## 1. Social Platform for a Vertical Community (production)

**Domain:** vehicle enthusiasts. Reviews, blog posts, marketplace listings,
events, clubs, real-time messaging.

| | |
|---|---|
| **Stack** | React 18 + TypeScript + Vite + Redux Toolkit + Tailwind · Node.js + Express + MySQL 8 + Redis 7 · Socket.IO · Docker Compose · React Native (Expo) + 108 routes · Nginx + Cloudflare CDN |
| **Scope** | ~200 REST endpoints · 80+ admin pages · 100+ migrations · ~100K LOC · web + mobile + admin panel |
| **Notable** | Tamper-evident hash-chained audit log · 4-layer admin gate · strict-CSP hardening · 10-platform PWA install · cross-flow real-time moderation. All detailed in [`snippets/`](snippets/) and [`case-studies/`](case-studies/). |
| **Status** | Live in production. |

---

## 2. Multi-Tenant SaaS for Auto Service Shops (production)

**Domain:** B2B platform letting independent auto shops manage clients,
mechanics, schedules, parts inventory, and billing. Multi-tenant — each
shop is isolated.

| | |
|---|---|
| **Stack** | Nx monorepo · NestJS-pattern Node.js + TypeORM + MySQL · Next.js (App Router) · Redis · MinIO (S3-compatible object storage) · React Native mobile companion · Docker Compose |
| **Scope** | Web admin + customer-booking web + mechanic mobile app · row-level tenancy isolation · scheduling engine · file uploads via S3-style API · 7 demo roles (SuperAdmin / Owner / Admin / Mechanic / Client tiers) |
| **Notable** | Microservices-ready compose (separate `docker-compose.microservices.yml`) · TypeORM migrations + seeders + clear-and-reseed pipeline · separate API docs surface |
| **Status** | Deployed, demo-ready for the US market. |

---

## 3. Language Learning Platform (production)

**Domain:** structured language learning for a minority language community.
Lesson sequencing, progress tracking, content management.

| | |
|---|---|
| **Stack** | React 18 frontend · React Native mobile · Express + MySQL backend · Separate admin React 18 panel · Docker Compose |
| **Scope** | 3 deployable surfaces (API · learner web · admin) · 3-tier user model (User / Admin / SuperAdmin) · React Native mobile app sharing the API |
| **Notable** | Independent admin SPA — content editors work on a different deployment from learners · isolated database, isolated Redis cache · git-driven content updates |
| **Status** | Deployed, demo accounts live. |

---

## 4. Mobile Game with Web + Admin Backend (production)

**Domain:** casual mobile game. Backend serves scoreboards, user accounts,
and admin moderation; web build for browser play; mobile build via React
Native.

| | |
|---|---|
| **Stack** | Express + MySQL + Redis backend · React 18 web client · React Native mobile · Separate React admin panel · Docker Compose with isolated network |
| **Scope** | 4 deployable surfaces (API · web game · mobile · admin) · auth + score persistence · admin moderation |
| **Notable** | Same auth and storage layer reused across all three clients (web / mobile / admin) — single API contract · admin panel separated from public-facing surfaces |
| **Status** | Deployed. |

---

## 5. Epistemic Sandbox: "Digital Laboratory of Alternative Realities" (in progress)

**Domain:** experimental web platform where users investigate worlds with
non-standard physics laws and earn discoveries by forming hypotheses and
running experiments. The core mechanic is the scientific method itself,
not gameplay.

| | |
|---|---|
| **Stack** | Fastify 5 backend · Next.js 15 (App Router) + React 19 frontend · Three.js for world rendering · pnpm workspaces monorepo (apps/server, apps/web, packages/db, packages/engine, packages/schemas, packages/types) · MySQL + Drizzle |
| **Architectural call** | Two-tier law model: Tier 1 (phenomenological / physical) laws are simulated by the world engine; Tier 2 (meta) laws describe how Tier 1 laws change. Users discover both layers. |
| **Scope** | MVP plan covers ~10 sprints · world simulation engine in its own package · separate type / schema packages shared by server and client |
| **Status** | Sprint-driven build in progress. Engine architecture and DB schema landed; world rendering and discovery loop next. |

---

## What's NOT here

A handful of folders in my dev environment are clones of other people's
open-source projects (used as tools, never claimed as my work). Those
are out-of-scope for this portfolio. The five projects above are mine.

---

## What this signals (the honest version)

- **Breadth:** five independent products across consumer social, B2B SaaS,
  education, casual gaming, and experimental UX. Each one is its own
  domain model, its own deployment, its own user research.
- **Stack range:** Express, Fastify, NestJS-pattern, TypeORM, Drizzle,
  raw SQL · React 18, React 19, Next.js, Vite, React Native · MySQL,
  Redis, MinIO · Docker, Cloudflare. Comfortable picking the right
  tool per project rather than defaulting to the same stack everywhere.
- **AI-assisted, not AI-generated:** every project went through real
  debugging, real war stories (see [`case-studies/`](case-studies/)),
  real production incidents that took 5 migrations to close. The AI
  multiplied output; the engineering judgement is mine.
- **Operationally honest:** four are deployed and running today. One is
  in active development. I'm not padding the list with side-project
  stubs.

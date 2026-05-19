# Engineering Portfolio (2025–2026)

This repository contains **sanitized, extracted snippets and case studies**
from production projects I designed and shipped over the past ~12 months
of AI-assisted development. The full codebases are proprietary, so what
you'll find here is the engineering practice — not runnable clones.

**For a one-page overview of the five products behind this portfolio →
[`PROJECTS.md`](PROJECTS.md).**

The deep-dives, code samples, and war stories below come from the
**largest** of those projects: a vertical-community social platform with
~200 REST endpoints, 80+ admin pages, 100+ database migrations, ~100K
LOC, web + mobile + admin. Product name and domain omitted intentionally
— this repository is about engineering practice, not the specific
business.

---

## What's in here

| Section | What it shows |
|---|---|
| [`PROJECTS.md`](PROJECTS.md) | One-page overview of all five production projects (stack, scope, status) |
| [`snippets/audit-log/`](snippets/audit-log/) | Tamper-evident hash-chained audit log (SHA256, transaction-locked sentinel, canonical walk order) |
| [`snippets/pwa-install/`](snippets/pwa-install/) | Cross-browser PWA install flow that actually works on every platform |
| [`snippets/admin-gate/`](snippets/admin-gate/) | 4-layer admin authentication (JWT → role → 2FA → PIN) |
| [`snippets/csp-hardening/`](snippets/csp-hardening/) | Strict CSP without `'unsafe-inline'`, and how to live with it |
| [`snippets/cross-flow-moderation/`](snippets/cross-flow-moderation/) | Real-time moderation: admin action → user feed updates instantly |
| [`case-studies/`](case-studies/) | War stories: bugs that took 5 migrations to close, debugging stale Docker bundles, CSP silently dropping a script |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | High-level system design, scaling playbook |

---

## What's intentionally NOT here

- Database schema, migrations, or seed data
- Full route registrations and business logic
- Authentication secrets, JWT keys, demo accounts
- Brand assets, domain references
- Frontend routing tables, Redux store wiring
- Mobile app code

These are excluded so a competitor cannot bootstrap a working clone from the
snippets. The product, identifiers, schemas, and proprietary algorithms stay
with the company.

---

## Why I think this is worth your time

Each snippet ships with a **README explaining the decision**, not just the
code. Look for the trade-offs and the war stories — the wrong-but-tempting
alternatives I rejected — that's the actual engineering signal here.

If a single file catches your eye, jump to:
- **[Audit log](snippets/audit-log/README.md)** — the showpiece
- **[5-migration hash-chain race](case-studies/hash-chain-race.md)** — most representative debugging story
- **[CSP silently dropped my GDPR script](case-studies/csp-silent-block.md)** — incident response

---

## License

Code snippets in this repo: MIT (for recruitment / educational reading).
Write-ups and case studies: CC BY 4.0.

The original product remains proprietary to its owner.

---

## A note on anonymity

This portfolio deliberately doesn't name the product or company. The
goal is to demonstrate engineering quality, not to advertise a brand
or expose internal details. If you're a recruiter and want to verify
authorship, drop me a message and I'll share the context privately.

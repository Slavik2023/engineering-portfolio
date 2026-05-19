# Strict CSP Without `'unsafe-inline'` — and How to Live With It

The production CSP header:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' https://www.googletagmanager.com
             https://www.google-analytics.com
             https://static.cloudflareinsights.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https:;
  font-src 'self' https: data:;
  connect-src 'self' https://<host> wss://<host> https: wss:;
  frame-ancestors 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  report-uri /api/v1/csp-report;
  upgrade-insecure-requests;
  script-src-attr 'none';
```

Two things to note:

1. **No `'unsafe-inline'` in `script-src`.** Inline `<script>` blocks
   are dead on arrival. This eliminates the whole XSS injection-via-
   inline-script class.
2. **`script-src-attr 'none'`.** Even inline event handlers (`onclick="…"`,
   `onload="…"`) are blocked. Anything attached must come from a script
   the CSP already approved.

## The cost: every "early" script needs to be a file

Common patterns that *don't* work under this header:

```html
<!-- BLOCKED. Silently. -->
<script>
  window.gdprConsentGate = (function () { /* ... */ })();
</script>

<!-- BLOCKED. -->
<button onclick="doThing()">click</button>

<!-- BLOCKED. -->
<script>
  document.documentElement.classList.add(
    localStorage.theme === 'dark' ? 'dark' : 'light'
  );
</script>
```

What works:

```html
<!-- ALLOWED. 'self' covers same-origin script files. -->
<script src="/gdpr-init.js"></script>
<script src="/pwa-init.js"></script>
<script src="/sw-register.js"></script>
<script src="/theme-init.js"></script>
<!-- React bundle, loaded as a module -->
<script type="module" src="/assets/index-XYZ.js"></script>
```

Anything that needs to run before the React bundle becomes a tiny file
under `/public`.

## The bug this protects against

In a previous iteration the GDPR consent script was inline. The HTTP
CSP header didn't include `'unsafe-inline'`. The browser silently dropped
the script — no console warning at default level, the `<script>` tag was
in the DOM but `window.gdprConsentGate` was undefined.

Consequence: Cloudflare Insights' RUM beacon, which the gate was
supposed to block until user consent, was loading on every page view
regardless of consent state. That's a GDPR / ePrivacy violation.

The detection signal was non-obvious — *nothing in the browser told us
the script wasn't running*. We caught it incidentally when investigating
a PWA install bug that had the same root cause (different inline script,
same silent drop).

See [`case-studies/csp-silent-block.md`](../../case-studies/csp-silent-block.md)
for the full incident write-up.

## Defence in depth checklist

What the CSP buys us. What it doesn't buy us. What we add on top:

| Threat | CSP alone? | Belt + suspenders |
|---|---|---|
| Stored XSS via post content | No — content is rendered, not executed inline JS | DOMPurify on all user HTML, strip on input + render |
| Reflected XSS via search query | No | Server-side validation + client escape |
| Clickjacking | `frame-ancestors 'none'` | + `X-Frame-Options: SAMEORIGIN` redundant for old browsers |
| Third-party script injection | Yes (`script-src` allowlist) | + SRI on critical scripts where feasible |
| Inline `onclick` handlers | Yes (`script-src-attr 'none'`) | No DB-stored HTML accepts event attributes |
| Form posts to attacker origin | `form-action 'self'` | + CSRF tokens on state-changing endpoints |
| Mixed content / downgrade | `upgrade-insecure-requests` | + HSTS preload |

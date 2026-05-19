# Case Study: CSP Silently Dropped My GDPR Consent Gate

> A bug that didn't show up in dev, didn't log anything in prod, and was
> *visible only in a third-party billing dashboard* — Cloudflare's RUM
> beacon volume.

## Premise

We have a cookie banner. EU users see it; "Accept All" stores
`localStorage.cookieConsent = 'accepted'`. Until they accept, we should
not load Cloudflare Insights, Google Analytics, or any other RUM beacon.

The implementation, in `index.html`:

```html
<script>
  (function () {
    if (localStorage.getItem('cookieConsent') === 'accepted') return;

    const BLOCKED = /cdn-cgi\/rum|static\.cloudflareinsights\.com|google-analytics/i;

    const origFetch = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input?.url || '');
      if (BLOCKED.test(url)) {
        return Promise.resolve(new Response('', { status: 204 }));
      }
      return origFetch.apply(this, arguments);
    };

    // ... same for XMLHttpRequest ...
  })();
</script>
```

Read it carefully. It's correct. It does what it claims.

In dev, it worked. The XHR/fetch wrappers were installed. Beacons to
`cdn-cgi/rum` were intercepted. `cookieConsent` controlled the behaviour.
Shipped to production with confidence.

## What we noticed

Roughly six weeks later, browsing Cloudflare's RUM dashboard, we saw
that beacon volume *exactly tracked unique page views*. Every single
page load was reporting RUM, regardless of cookie state.

This shouldn't be happening. The consent gate was supposed to block
RUM until accept.

## What we checked first

- Was the `<script>` tag in the served HTML? Yes (`curl https://...` confirmed).
- Was the right value in `cookieConsent`? Tested with consent set to "no".
  Beacon still fired.
- Was the script being executed? Console showed no errors at default
  log level. `window.cookieConsentApplied` flag we added inside the IIFE
  was... undefined. The script wasn't running at all.

That last finding is what cracked it. Why wouldn't an `<script>` block
in the HTML execute?

## The CSP

Our production HTTP `Content-Security-Policy` header (set by nginx, not
by the `<meta>` tag in the HTML — those don't combine, the more
restrictive wins):

```
script-src 'self' https://www.googletagmanager.com
           https://www.google-analytics.com
           https://static.cloudflareinsights.com;
```

No `'unsafe-inline'`. No nonce. No hash. **Inline `<script>` blocks
are forbidden.**

Default Chrome doesn't print a console error for CSP violations unless
the developer console is open at the time of the violation (depending
on settings). In production, where no console is open, the script
silently doesn't run.

We did have `report-uri /api/v1/csp-report;` configured. The endpoint
existed but we never read the logs because we'd never seen anything
interesting there. There were ~thousands of "inline script blocked"
reports going to that endpoint, sitting in the DB, ignored.

## The fix

Move the script into `/public/gdpr-init.js` and reference it as a file:

```html
<script src="/gdpr-init.js"></script>
```

External scripts only need `'self'` in `script-src`, which is allowed.
The file is byte-for-byte the same code, just in a separate file.

Deployed. Cloudflare RUM beacon volume dropped to ~14% of unique page
views (the proportion of users who accept cookies — about right for
our EU traffic mix).

## What I learned

- **An inline script in `index.html` is not the same as an inline script
  in dev.** Dev's Vite serves a less restrictive CSP. The first time
  the strict CSP applies is in production, and you find out at the
  worst possible moment.
- **Read your CSP report endpoint.** I'd built it and forgotten about
  it. Six weeks of "inline script blocked" reports would have caught
  this on day one.
- **Use a startup-time `__pwaEarlyRan = true` (or equivalent) flag.** If
  you can't see whether your bootstrap script ran, you can't know
  whether it's working. The flag is free. Read it from the next stage
  of bootstrap and bail loudly if it's missing.
- **The same bug ate our PWA install button.** Different inline script,
  same silent drop, same root cause. Found it because the PWA install
  was reported as broken; that investigation incidentally revealed the
  consent gate had the same problem.

## What this generalises to

Any "early init" code — analytics consent, theme application before
React renders, polyfills, feature detection that needs to run before
the bundle — has to be an external file under strict CSP. Inline
scripts are a habit from a more permissive era. They look identical
in source and they Don't Work.

Audit checklist:

```bash
grep -n '<script>' index.html public/*.html
# every match is a candidate for silent drop in prod
```

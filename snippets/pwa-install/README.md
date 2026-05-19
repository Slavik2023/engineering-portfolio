# PWA Install — That Actually Works Everywhere

PWA install is one of those features that sounds simple ("user clicks
button, app installs") and turns out to be ten different problems wearing
a trenchcoat.

## The platform matrix

| Platform | What's possible | What our code does |
|---|---|---|
| Android Chrome / Edge / Brave | Native install via `beforeinstallprompt` | Capture event, call `prompt()` on click |
| Samsung Internet | No `beforeinstallprompt`, has menu install | Show step-by-step "menu → Add page to" sheet |
| Firefox Android | No `beforeinstallprompt`, has menu install | Show step-by-step "⋮ → Install" sheet |
| iOS Safari | **No JS install at all** (Apple) | Show Share → Add to Home Screen sheet |
| iOS Chrome / Firefox / Edge | Wrappers on WebKit, can't install at all | Show "Open this page in Safari" + Copy link |
| Desktop Chromium | Native install via `beforeinstallprompt` | Capture event, call `prompt()` on click |
| Desktop Firefox | No install support | Suggest Chromium/Edge + Copy link |
| Desktop Safari 17+ | File → Add to Dock | Show that flow |

UA detection chooses which sheet to render. `prompt()` is only called when
we actually have a captured deferred event; everything else is manual
guidance.

## Two non-obvious bugs we solved

### 1. `beforeinstallprompt` was fired before React mounted

Chrome dispatches `beforeinstallprompt` as soon as the manifest and the
service worker are parsed. That's typically *before* the React bundle
finishes booting and registers its `addEventListener('beforeinstallprompt')`
handler. The event is missed, `window.__deferredInstall` stays null forever,
the button silently does nothing.

Fix: register the listener at HTML parse time, in a tiny external script
loaded before the React bundle. It just stashes the event on `window`
and dispatches a custom DOM event for React to subscribe to later.

See [`pwa-init.js`](pwa-init.js).

### 2. Strict CSP silently dropped that inline script

First version of the fix above was inline:

```html
<script>
  window.addEventListener('beforeinstallprompt', e => {
    window.__deferredInstall = e;
    e.preventDefault();
  });
</script>
```

This is correct. It still didn't work. Took an hour to spot why: the
production HTTP `Content-Security-Policy` header omits `'unsafe-inline'`
from `script-src`. The browser silently dropped the inline script —
no console warning at the default reporting level, no CSP report
endpoint configured at the time. The script was simply *not executed*.

Fix: move it into `/public/pwa-init.js` and reference it as
`<script src="/pwa-init.js"></script>`. External scripts only need
`'self'` in `script-src`, which we have.

Took us out as a bonus a different bug — the GDPR consent gate, which
was *also* inline, *also* silently dropped, *also* never executed.
Cloudflare RUM was loading before any user had a chance to consent.
See [`csp-hardening/`](../csp-hardening/) for that one.

## The polling fallback

Even with the early listener, there's a window where the React component
mounts, looks for `window.__deferredInstall`, finds it null, and doesn't
get a re-render when the event arrives later. The fix is small:

- On mount, check the global first. If set, use it.
- If not set, listen for the custom `install-ready` event from the early
  script.
- On click, if still not set, poll for up to 1.5 seconds — covers a tail
  case where Chrome fires the event *after* a user gesture (specifically,
  the click itself qualifies as engagement and unlocks the prompt).

See [`install-button.tsx`](install-button.tsx) for the full state machine.

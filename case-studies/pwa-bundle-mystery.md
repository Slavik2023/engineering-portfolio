# Case Study: The Bundle That Wouldn't Update

> An hour of "I rebuilt this, why is prod still serving the old version?"
> ending in a useful lesson about Vite's code-splitting and chunk
> filenames.

## The premise

I rewrote the PWA install button. Significant change — new state
machine, ten platform-specific instruction sheets, busy-state handling.
Committed, pushed, deployed:

```bash
git push origin master
ssh prod 'cd /var/www/app && git pull --rebase && \
          cd deploy && docker compose build frontend && \
          docker compose up -d --force-recreate frontend'
```

Container restarted. Health check passed. I opened the site in
Chrome, hit Ctrl+Shift+R to bypass the browser cache.

The old behaviour was still there.

## What I checked

I checked the obvious caches first:

1. **Service Worker?** Unregistered it via DevTools, cleared all caches,
   reloaded. No change.
2. **Cloudflare?** Purged the entire site. No change.
3. **Docker layer cache?** Rebuilt with `--no-cache`. No change.
4. **Container actually has the new code?**
   ```bash
   docker exec frontend grep -c 'Opening…' /usr/share/nginx/html/assets/js/*.js
   # 0
   ```
   Zero. The string from my new code wasn't in any served file.

That last finding broke my mental model. The source in the container
*did* contain the new code:

```bash
docker exec frontend cat /usr/share/nginx/html/index.html | grep main
# <script src="/assets/index-DqsaPZVt.js"></script>
```

But the main bundle didn't contain my string. So either Vite was
building the wrong code, or the string was somewhere *else*.

## The shift

I'd been grepping `index-*.js` — the entry chunks. But Vite does
aggressive code-splitting. The InstallAppButton lives on the landing
page, which is lazy-loaded. So its code lives in its own chunk:

```bash
docker exec frontend grep -l 'Opening…' /usr/share/nginx/html/assets/js/*.js
# /usr/share/nginx/html/assets/js/Landing-DQU0Srjd.js
```

There it was. The string was in `Landing-*.js`, not `index-*.js`.
My new code *had* deployed. It just wasn't in the chunk I'd been
checking.

## What was actually going on

Vite + Rollup splits chunks by:
1. The entry (`index-*.js`)
2. Manual chunks (`react-vendor-*`, `redux-vendor-*`, etc.)
3. **Each lazy-imported route** — gets its own chunk named after the
   component, e.g. `Landing-*.js`

The chunk filename hash changes only if the chunk's contents change.
The `Landing-*.js` hash had in fact changed across deploys; the
`index-*.js` hash hadn't because the entry wasn't touched.

I'd convinced myself the deploy didn't take by checking the wrong file.
The new code was live the whole time. The browser cache + Service
Worker hadn't refreshed *yet*, so the *running tab* was still using
the old chunk references — but anyone opening the site fresh got the
new version immediately.

## The actual lesson

When verifying a frontend deploy:

1. **Check `index.html` for the new entry hashes.** `<script src="...">`
   tags change when chunks change. If they're the same as before, nothing
   has changed for new visitors.
2. **Check the specific chunk where your change lives.** `grep -l <string>
   /assets/js/*.js` finds it across all chunks, not just `index-*.js`.
3. **Don't trust the running tab.** It cached the old chunk filenames at
   load time. Open an Incognito window or fully reload (network panel,
   "Disable cache" while DevTools open) to verify what new visitors see.

## What this generalises to

Code-splitting plus content-addressed filenames means a single deploy
ships *N* independently-versioned chunks. Most of them won't change on
any given deploy. "The bundle didn't update" is almost always "I'm
looking at a chunk that didn't need to update."

If you have a CI verification step, make it walk every chunk in
`index.html` plus the dynamic-import map, not just the entry.

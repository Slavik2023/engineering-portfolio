/**
 * Early PWA install-prompt capture.
 *
 * Loaded via <script src="/pwa-init.js"></script> in the page head, BEFORE
 * the React bundle. Reasons:
 *
 *  - Chrome fires `beforeinstallprompt` as soon as the manifest + SW are
 *    parsed. If React hasn't booted yet, the event is missed and the
 *    install button can never trigger the native dialog.
 *
 *  - Strict HTTP CSP (no `'unsafe-inline'` in script-src) blocks inline
 *    <script> blocks. External files served from the same origin satisfy
 *    `script-src 'self'` and are allowed to execute.
 *
 * Exposes three globals + two custom events for the React layer:
 *
 *   window.__deferredInstall    : the BeforeInstallPromptEvent or null
 *   window.__installedFlag      : true if the app is already installed
 *                                  (display-mode: standalone or iOS)
 *   window.__pwaEarlyRan        : true if this script executed (debug aid)
 *
 *   'pwa-install-ready'         : dispatched when the deferred event arrives
 *   'pwa-installed'             : dispatched on appinstalled
 */
(function () {
  try {
    window.__pwaEarlyRan = true;
    window.__deferredInstall = null;

    // Two ways to detect "already installed":
    //  - matchMedia('(display-mode: standalone)') for desktop / Android
    //  - navigator.standalone for iOS Safari's homescreen apps
    window.__installedFlag =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;

    window.addEventListener('beforeinstallprompt', function (e) {
      // Chrome's default behaviour is to show its own mini-infobar.
      // We want full control, so suppress it and call prompt() ourselves.
      try { e.preventDefault(); } catch (_) {}

      window.__deferredInstall = e;

      // Notify any React component already mounted and waiting.
      try { window.dispatchEvent(new CustomEvent('pwa-install-ready')); } catch (_) {}
    });

    window.addEventListener('appinstalled', function () {
      window.__deferredInstall = null;
      window.__installedFlag = true;
      try { window.dispatchEvent(new CustomEvent('pwa-installed')); } catch (_) {}
    });
  } catch (err) {
    // Fail-open: if matchMedia / addEventListener somehow throw on this
    // browser, leave the globals undefined and let the React component
    // fall through to manual instructions.
    try { window.__pwaEarlyError = String(err && err.message); } catch (_) {}
  }
})();

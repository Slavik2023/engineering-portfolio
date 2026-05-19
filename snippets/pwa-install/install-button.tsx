/**
 * Cross-platform PWA install button.
 *
 * Sanitized excerpt. The actual production component renders ten
 * platform-specific instruction sheets (iOS Safari, iOS Chrome,
 * Android Chrome, Samsung Internet, Firefox Android, Desktop Chromium,
 * Desktop Firefox, Desktop Safari, etc.) — they're omitted here to
 * keep the file readable. The core state machine is intact.
 *
 * Read the README in this folder for the design rationale.
 */
import { useEffect, useMemo, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    __deferredInstall?: BeforeInstallPromptEvent | null;
    __installedFlag?: boolean;
  }
}

type Platform =
  | 'ios-safari'
  | 'ios-other'
  | 'android-chrome'
  | 'android-other'
  | 'desktop-chromium'
  | 'desktop-other';

function detectPlatform(): Platform {
  const ua = navigator.userAgent || '';
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    ((navigator as any).platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);

  if (isIOS) {
    // CriOS / FxiOS / EdgiOS = iOS Chrome / Firefox / Edge.
    // These are WebKit wrappers; Apple does not surface an install API to them.
    if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return 'ios-other';
    return 'ios-safari';
  }
  if (/Android/i.test(ua)) {
    if (/Chrome|Edg|OPR/i.test(ua)) return 'android-chrome';
    return 'android-other';
  }
  if (/Chrome|Edg|OPR/i.test(ua)) return 'desktop-chromium';
  return 'desktop-other';
}

export default function InstallAppButton() {
  const platform = useMemo(detectPlatform, []);
  const [installed, setInstalled] = useState(window.__installedFlag === true);
  const [hasPrompt, setHasPrompt] = useState(!!window.__deferredInstall);
  const [busy, setBusy] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    // The early /pwa-init.js may have already captured the event before
    // this component mounted. Reconcile on mount.
    if (window.__deferredInstall) setHasPrompt(true);
    if (window.__installedFlag) setInstalled(true);

    // Two flavours of the same notification — native and our custom event
    // dispatched by /pwa-init.js. Listening to both is robust against
    // load-order surprises.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__deferredInstall = e as BeforeInstallPromptEvent;
      setHasPrompt(true);
    };
    const onReady = () => setHasPrompt(true);
    const onInstalled = () => {
      setInstalled(true);
      window.__deferredInstall = null;
      setShowFallback(false);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('pwa-install-ready', onReady);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('pwa-installed', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('pwa-install-ready', onReady);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('pwa-installed', onInstalled);
    };
  }, []);

  if (installed) return null;

  // Chrome sometimes withholds beforeinstallprompt until the first user
  // gesture. The click that just happened qualifies, so a brief poll
  // catches the late fire. 1500ms is enough in practice.
  const waitForDeferred = (): Promise<BeforeInstallPromptEvent | null> =>
    new Promise((resolve) => {
      if (window.__deferredInstall) return resolve(window.__deferredInstall);
      let elapsed = 0;
      const id = window.setInterval(() => {
        if (window.__deferredInstall) {
          window.clearInterval(id);
          resolve(window.__deferredInstall);
        }
        elapsed += 100;
        if (elapsed >= 1500) {
          window.clearInterval(id);
          resolve(null);
        }
      }, 100);
    });

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const deferred = window.__deferredInstall ?? (await waitForDeferred());

      if (deferred) {
        // Native install. Browser owns the dialog from here.
        try {
          await deferred.prompt();
          const { outcome } = await deferred.userChoice;
          if (outcome === 'accepted') setInstalled(true);
          window.__deferredInstall = null;
          setHasPrompt(false);
          return;
        } catch {
          // fall through to manual fallback
        }
      }

      // No native install available (iOS Safari, Firefox, in-app browsers).
      // Render platform-specific instructions instead.
      setShowFallback(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-label="Install app"
        style={{ /* design tokens omitted */ }}
      >
        {busy ? 'Opening…' : 'Install App'}
      </button>

      {showFallback && (
        <InstallInstructionSheet
          platform={platform}
          onClose={() => setShowFallback(false)}
        />
      )}
    </>
  );
}

/**
 * Renders the platform-specific manual install steps. Full content omitted
 * — production version has ten platforms × three steps each, all with
 * inline hex colours (not Tailwind utilities) so they survive any parent
 * cascade in dark mode.
 */
function InstallInstructionSheet(_props: {
  platform: Platform;
  onClose: () => void;
}) {
  return null; /* see README for the rationale on inline colors */
}

import { Platform } from 'react-native';

/**
 * Android/Chrome fires this event once, early, when it decides the site is
 * installable -- if nothing captures it immediately, there's no way to get it back
 * later on demand. So this listener is registered once at app startup (see
 * initPwaInstallListener, called from the root layout) and the event is held here
 * until a screen (the Profile page's install button) is ready to use it.
 *
 * iOS Safari never fires this event at all -- there is no API on iOS that lets a
 * website trigger "Add to Home Screen" programmatically. isIOS() exists so the UI
 * can fall back to showing manual instructions instead of a broken button.
 */
let deferredPrompt: any = null;
let listeners: Array<() => void> = [];

function notify() {
  listeners.forEach((l) => l());
}

export function initPwaInstallListener() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function subscribePwaInstallChanges(cb: () => void): () => void {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

export function canPromptInstall(): boolean {
  return !!deferredPrompt;
}

/** Resolves true if the browser's own install dialog was accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  notify();
  return choice.outcome === 'accepted';
}

/** True once already running as the installed app, not a regular browser tab. */
export function isStandalone(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const mql = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const iosStandalone = (window.navigator as any).standalone === true;
  return !!mql || iosStandalone;
}

export function isIOS(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

import { Platform } from 'react-native';

/**
 * Expo Router's app/+html.tsx only gets applied when web.output is "static" (build-time
 * server rendering) -- this app can't use that mode because the Supabase auth client
 * crashes with "window is not defined" under Node-based static rendering. Injecting the
 * "Add to Home Screen" tags at runtime instead achieves the same result (installable PWA
 * on Android/Chrome and iOS Safari) without needing that build mode.
 */
export function injectPwaMetaTags() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  document.title = 'Island Tower';

  const addTag = (tag: 'link' | 'meta', attrs: Record<string, string>) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    document.head.appendChild(el);
  };

  addTag('link', { rel: 'manifest', href: '/manifest.json' });
  addTag('link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' });
  addTag('meta', { name: 'theme-color', content: '#0f172a' });
  addTag('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  addTag('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
  addTag('meta', { name: 'apple-mobile-web-app-title', content: 'Island Tower' });
}

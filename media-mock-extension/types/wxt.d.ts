// Import WXT types from the correct paths
import type { defineBackground } from 'wxt/utils/define-background';
import type { defineContentScript } from 'wxt/utils/define-content-script';
import type { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import type { Browser } from 'wxt/browser';

// Make them globally available
declare global {
  const defineBackground: typeof import('wxt/utils/define-background')['defineBackground'];
  const defineContentScript: typeof import('wxt/utils/define-content-script')['defineContentScript'];
  const defineUnlistedScript: typeof import('wxt/utils/define-unlisted-script')['defineUnlistedScript'];
  const chrome: typeof import('@types/chrome')['chrome'];
  const browser: Browser;
}
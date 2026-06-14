import { sdk } from '@smoud/playable-sdk';
import { alTrack } from './alAnalytics';

interface MraidLike {
  getState?: () => string;
  addEventListener?: (event: string, fn: () => void) => void;
}

export function safeInstall(): void {
  alTrack('CTA_CLICKED');
  const w = window as unknown as { mraid?: MraidLike; dapi?: unknown };
  const m = w.mraid;
  if (m && typeof m.getState === 'function' && m.getState() === 'loading') {
    m.addEventListener?.('ready', () => sdk.install());
    return;
  }
  // Open the store. In the preview/no-network build the SDK falls back to
  // window.open(storeUrl) — a NEW tab — which keeps the playable tab ALIVE, so flows that resume
  // on return (the clash-royal soft store-CTA: the live fight / win-retry keeps running underneath)
  // still work after a store visit. We deliberately do NOT force a top-level location.href
  // navigation under a mobile UA: that hijacked the playable tab (incl. desktop device-emulation),
  // replacing the game with the store so the user could never return to continue. Real builds route
  // the CTA through their own container — mraid.open (applovin/unity), ExitApi.exit (google),
  // FbPlayableAd.onCTAClick (moloco) — which open the store as an overlay and keep the ad alive.
  // (Trade-off: on a REAL phone, a preview build's window.open may be popup-blocked from a canvas
  // tap, so the store may not auto-open there — CTA_CLICKED still fires and the fight continues.)
  try { sdk.install(); } catch { /* no ad-network handler attached */ }
}

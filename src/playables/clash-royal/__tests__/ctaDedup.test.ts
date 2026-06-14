import { test } from 'node:test'; import assert from 'node:assert/strict';

// Iteration #3 analytics invariant: the store-CTA funnel event CTA_CLICKED is DEDUPED, so the
// new spammy-volley trigger firing alongside the existing terminal end-card/defeat CTA can never
// multi-count. alTrack() (the @shared/alAnalytics funnel) holds a module-level `fired` Set and
// drops any repeat of an already-fired event. We drive it directly through a stub network hook.
//
// alTrack reads `window.ALPlayableAnalytics`; the bare Node runner has no `window`, so install a
// minimal stub that records the in-order trackEvent sequence.
const events: string[] = [];
(globalThis as unknown as { window?: unknown }).window = {
  ALPlayableAnalytics: { trackEvent: (e: string) => { events.push(e); } },
};

test('CTA_CLICKED is deduped — multiple volley/terminal triggers fire it at most once', async () => {
  const { alTrack } = await import('@shared/alAnalytics');
  // Simulate the funnel: the early ordering events, then several CTA triggers (a volley redirect
  // + a later terminal CTA all route through alTrack('CTA_CLICKED')), then the end card.
  alTrack('CHALLENGE_STARTED');
  alTrack('CTA_CLICKED');   // first store visit (e.g. spammy volley)
  alTrack('CTA_CLICKED');   // second trigger (a later volley) — must be dropped
  alTrack('CTA_CLICKED');   // terminal defeat/end-card CTA — must be dropped
  alTrack('ENDCARD_SHOWN');

  const ctaCount = events.filter(e => e === 'CTA_CLICKED').length;
  assert.equal(ctaCount, 1, 'CTA_CLICKED delivered exactly once despite 3 triggers');
  // Order invariant: CTA_CLICKED lands after CHALLENGE_STARTED and before ENDCARD_SHOWN.
  assert.deepEqual(events, ['CHALLENGE_STARTED', 'CTA_CLICKED', 'ENDCARD_SHOWN']);
});

type ALEvent =
  | 'LOADING' | 'LOADED' | 'DISPLAYED'
  | 'CHALLENGE_STARTED'
  | 'CHALLENGE_PASS_25' | 'CHALLENGE_PASS_50' | 'CHALLENGE_PASS_75'
  | 'CTA_CLICKED' | 'ENDCARD_SHOWN';

interface ALPlayableAnalytics {
  trackEvent: (event: string) => void;
}

const fired = new Set<ALEvent>();
// Events fired BEFORE the ad network injected window.ALPlayableAnalytics. The early funnel
// events (LOADING, then LOADED/DISPLAYED/CHALLENGE_STARTED ~100-450ms later) run during the
// synchronous JS-boot, which can race AHEAD of the network's hook injection. Without this
// queue they'd be marked fired and silently dropped forever (the dedup never retries). We hold
// them here and flush in-order the moment the hook appears, so the top of the funnel is never lost.
const pending: ALEvent[] = [];
let pollTimer: ReturnType<typeof setInterval> | null = null;

function getHook(): ALPlayableAnalytics | undefined {
  const al = (window as unknown as { ALPlayableAnalytics?: ALPlayableAnalytics }).ALPlayableAnalytics;
  return (al && typeof al.trackEvent === 'function') ? al : undefined;
}

function stopPolling(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function flushPending(): void {
  const al = getHook();
  if (!al) return;
  while (pending.length) { try { al.trackEvent(pending.shift()!); } catch { /* ignore */ } }
  stopPolling();
}

export function alTrack(event: ALEvent): void {
  if (fired.has(event)) {
    return;
  }
  fired.add(event);
  const al = getHook();
  if (al) {
    // Hook present (the normal case) — deliver immediately, behavior unchanged. Flush any
    // earlier-queued events first so order is preserved if the hook just arrived this tick.
    if (pending.length) flushPending();
    try { al.trackEvent(event); } catch { /* ignore */ }
    return;
  }
  // Hook absent — queue this event (FIFO) and poll for the hook's arrival, then flush in order.
  pending.push(event);
  if (!pollTimer && typeof setInterval === 'function') {
    pollTimer = setInterval(flushPending, 50);
    // Bounded so we never leak a timer in an env that never injects the hook.
    if (typeof setTimeout === 'function') setTimeout(stopPolling, 8000);
  }
}

import { sdk } from '@smoud/playable-sdk';
import type { PlayableType, PlayableLifecycle } from '@shared/PlayableType';
import './index.css';

function getPlayableType(): string {
  if (__DEV__) {
    const param = new URLSearchParams(window.location.search).get('type');
    if (param) {
      return param;
    }
  }
  return typeof PLAYABLE_TYPE !== 'undefined' ? PLAYABLE_TYPE : 'board-fight';
}

// To add a new playable type: add a case to the dev switch AND an `if` block
// in the production section below it.
async function loadPlayableType(): Promise<PlayableType<any>> {
  // Dev mode: URL param takes priority so the TypePicker dropdown works
  if (__DEV__) {
    const name = getPlayableType();
    switch (name) {
      case 'board-fight':
        return (await import('./playables/board-fight')).default;
      case 'end_card':
        return (await import('./playables/end_card')).default;
      case 'sidescroller':
        return (await import('./playables/sidescroller')).default;
      case 'dice-blackjack':
        return (await import('./playables/dice-blackjack')).default;
      case 'clash-royal':
        return (await import('./playables/clash-royal')).default;
      case 'egg-summon':
        return (await import('./playables/egg-summon')).default;
      case 'egg-crack':
        return (await import('./playables/egg-crack')).default;
      case 'egg-escalate':
        return (await import('./playables/egg-escalate')).default;
    }
    throw new Error(`Unknown playable type: ${name}`);
  }
  // Production: `if (PLAYABLE_TYPE === ...)` lets webpack tree-shake unused types
  if (PLAYABLE_TYPE === 'board-fight') {
    return (await import('./playables/board-fight')).default;
  }
  if (PLAYABLE_TYPE === 'end_card') {
    return (await import('./playables/end_card')).default;
  }
  if (PLAYABLE_TYPE === 'sidescroller') {
    return (await import('./playables/sidescroller')).default;
  }
  if (PLAYABLE_TYPE === 'dice-blackjack') {
    return (await import('./playables/dice-blackjack')).default;
  }
  if (PLAYABLE_TYPE === 'clash-royal') {
    return (await import('./playables/clash-royal')).default;
  }
  if (PLAYABLE_TYPE === 'egg-summon') {
    return (await import('./playables/egg-summon')).default;
  }
  if (PLAYABLE_TYPE === 'egg-crack') {
    return (await import('./playables/egg-crack')).default;
  }
  if (PLAYABLE_TYPE === 'egg-escalate') {
    return (await import('./playables/egg-escalate')).default;
  }
  throw new Error(`Unknown playable type: ${PLAYABLE_TYPE}`);
}

let lifecycle: PlayableLifecycle;

sdk.init(async (width, height) => {
  if (__DEV__) {
    import('./dev/TypePicker').then(m => m.mount(getPlayableType()));
  }
  const type = await loadPlayableType();
  const script = await type.getScript();
  lifecycle = type.create(width, height, script);
});

sdk.on('resize', (w: number, h: number) => lifecycle?.resize(w, h));
sdk.on('pause', () => lifecycle?.pause());
sdk.on('resume', () => lifecycle?.resume());
sdk.on('finish', () => lifecycle?.showEndCard());

// Shared access to the board-fight battle backgrounds ("bg flavors") so any fight
// playable can use them. Thin re-export — the source modules stay in board-fight's
// catalog so its codegen lookup + the egg-summon/egg-escalate cross-imports keep working.
// PIXI v8: callers MUST `Assets.load(data)` before use (see lessons.md / check:textures).
export { default as stage1 } from '../../playables/board-fight/catalog/battleBgs/stage1';
export { default as stage2 } from '../../playables/board-fight/catalog/battleBgs/stage2';
export { default as stage3 } from '../../playables/board-fight/catalog/battleBgs/stage3';
export { default as stage4 } from '../../playables/board-fight/catalog/battleBgs/stage4';
export { default as stage5 } from '../../playables/board-fight/catalog/battleBgs/stage5';
export { default as stage6 } from '../../playables/board-fight/catalog/battleBgs/stage6';
export { default as stage7 } from '../../playables/board-fight/catalog/battleBgs/stage7';
export { default as stage7Island } from '../../playables/board-fight/catalog/battleBgs/stage7Island';

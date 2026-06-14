# dice-blackjack playable

A playable ad based on the Dice Blackjack minigame in the live PocketRoll Unity game (`pocketroll/Assets/Gameplay/Minigames/DiceBlackjack/`). Player rolls 2d6 vs a Gambler NPC, rigged to win most rounds, ends in an Install CTA.

## Quick start

```bash
# from pocketroll-playables/
npm run dev:variant -- --type dice-blackjack demo dev
# → http://localhost:3000/?type=dice-blackjack
```

Build production HTML for AppLovin:
```bash
npm run build:variant -- --type dice-blackjack demo build applovin
```

Run tests (19 passing, ~7s):
```bash
npm run test:dice-blackjack
```

## File map

| File | Purpose |
|---|---|
| `index.ts` | PlayableType adapter |
| `config.ts` | `BlackjackScript` schema + `DEFAULT_SCRIPT` (rules, rigging, timings, dialogue) |
| `BlackjackDirector.ts` | PlayableLifecycle — owns Application, SceneManager. Reads `visualViewport` for accurate sizing. Pushes shared `EndCardScene` on win. |
| `BlackjackScene.ts` | Main Scene. HUD, dice, buttons, FTUE hand, dialogue bubble, juice (popups/shake/coin rain). |
| `Sequence.ts` | Game-loop FSM (Playing → PostGame → Finished). Ports `DiceBlackjackSequence.cs`. |
| `RigPolicy.ts` | Player/opponent reroll mechanics. |
| `BlackjackDice.ts` | Wraps two `Die3D`s. 8 variations per throw (clip + swap + flipX + speed + spread). Fly-to-bar after settle. |
| `Die3D.ts` | Copied from `../board-fight/`. 6 PixiJS Meshes (one per face), Unity .anim playback. Supports separate `posScaleY` for tall drop arc. |
| `dicePips.ts` | Copied from `../board-fight/`. Bakes 6 face textures via `renderer.generateTexture`. |
| `LoadBar.ts` | Unity 9-slice bar with green→orange gradient fill, blackjack pulse, bust shake, sparkles, +N popup, counter tick. |
| `layout.ts` | Pure `computeLayout(width, height)` — covers every phone aspect ratio. Tested in `__tests__/layout.test.ts`. |
| `data/diceAnimations.json` | 3 Unity Dice_Roll clips, ~30 KB. Regenerate via `scripts/extract-dice-anim-blackjack.js`. |
| `__tests__/` | Node test runner + tsx. RigPolicy, Sequence, layout. |

## Layout architecture

- **Background** (cave art): aspect-FILLS the viewport (Math.max), sits OUTSIDE `uiRoot` so it covers the screen on every aspect ratio.
- **UI** (bars, buttons, dice): inside `uiRoot`, scaled with Math.min so nothing crops horizontally. Bottom-anchored elements use `effectiveRefH = height / scale` to hug the actual viewport bottom on tall phones.
- See `layout.ts` for the pure layout function, tested across iPhone SE, iPhone 14, Pixel 7, Galaxy Fold, iPad portrait/landscape, desktop.

## Audio

All from `../board-fight/sfx.ts` (shared WebAudio engine, iOS-safe):
- BGM: `Level1_Compressed_Theme.mp3` at 0.6× SDK volume, loops, gated on first user gesture
- Dice rattle: `Dice_Roll.mp3`
- Button click: `ButtonClick.mp3`
- Win/lose/blackjack: `Blackjack_{Win,Lose,TwentyOne}.mp3` via `sfx-blackjack.ts`

## Juice constants

Spread across `LoadBar.ts` and `BlackjackScene.ts`. Tune in place:
- Bar: `FILL_ANIM_MS`, `POPUP_DURATION_MS`, `SQUASH_DURATION_MS`, `PULSE_DURATION_MS`, `BUST_SHAKE_MS`, `SPARKLE_COUNT/LIFE`
- Scene: `FLASH_DURATION_MS`, `SCREEN_SHAKE_MS`, `BIG_ROLL_THRESHOLD`, `COIN_COUNT_*`, `COIN_LIFETIME_MS`, `RESOLVE_DELAY_MS`

## Open work

- Replace placeholder store URLs in `build.json` before AppLovin submission
- Run through AppLovin Creative Hub preview validator
- Potential clone with alternating-turn rules (mode flag on `BlackjackScript` recommended)

## Things NOT to undo (UX decisions locked in)

- ROLL on right / STAND on left (thumb-side primary)
- No mid-game CTA pill (end card is the only CTA)
- No "Reach 21!" title
- Dealer centered above the stage (not on the right edge)
- Dice land in the upper half of the inner stone ring
- Speech bubble in handwritten font (Chalkboard SE stack), tail points at dealer's face
- BG aspect-fills viewport, body bg is `#14241f` to mask any 1px gaps

# Lessons

A living log of how this repo actually works and mistakes worth not repeating.
Append new entries as we learn. Newest sections at the top of each area.

> **For the agent:** When you discover a non-obvious fact about how this project
> works, or you hit a mistake and recover from it, add it here. Each lesson:
> what I expected → what was actually true → the fix/rule. Keep entries terse.

> **Reference this file at the start of any playable work**, and re-read the
> relevant section before reinventing something the game already defines.

**Contents:** [Game fidelity / where the real game lives](#game-fidelity--match-the-real-game-do-not-invent-or-guess) ·
[Assets & build](#assets--build) · [Components library](#components-library-components-skill) ·
[PIXI / scene patterns](#pixi--scene-patterns-board-fight) · [Verifying a visual playable](#verifying-a-visual-playable) ·
[egg-summon](#egg-summon-playable) · [Audio](#audio-egg-summon) · [egg-escalate](#egg-escalate-two-fight--boss-land-cta)

---

## Game fidelity — match the real game, do NOT invent or guess

**The #1 source of rework in this repo:** building a playable that's supposed to
mirror the live game, but inventing the visuals/colors/animation/positions instead
of pulling the real ones. In the egg-summon build, every guessed value was wrong and
got sent back: egg art (used procedural shapes vs the real egg sprite), the crack
animation (invented motion vs the real keyframes), rarity colors (made-up palette),
shake cadence, reveal text, the board (placeholder rectangles), the pick UI, and the
fight pet's size + position + render order. **If a thing should "look like the game,"
open the game source and extract the exact asset / color / keyframe / transform.**

### Where the real game lives (source of truth)
- Local checkout: `~/Desktop/RougeLegend/pocketroll` (git: bitbucket `pockethaven/pocketroll`). Authoritative for assets, animation clips, prefab transforms, configs, remote config.
- Pets: `Assets/Gameplay/BattleSystem/Pets/<NN Rarity>/<Pet>/` — Spine (`<Pet>.json` + `.atlas.txt` + `.png`), a static `<Pet>_Sprite.png`, and `Pet Config`. Names/rarities/evolutions: `remote_config_latest.json` → `Pets.default.pets` (24 pets; e.g. Glacidrake = Mythic → evolves Scalifrost).
- Egg/summon animation: `Assets/PocketRoll/MainMenu/Pets/Popup_Summon_Info/` — `SummonEgg_Controller.controller` + clips `SummonEgg_{Shake,Open,Idle,Rays_<Rarity>}.anim`. Driver: `Assets/MainMenu/RewardReceived/Scripts/LootBoxPetEggAnimation.cs`.
- Egg art: `Assets/PocketRoll/MainMenu/Pets/Pets_Images/Pets_Summon_Icon{,_Open,_White,_Shards}.png`.
- Rarity colors: `Assets/ColorMapperPresets.asset` (rarity name → colorId) + `Assets/Scripts/Utils/ColorManagement/ColorManager.asset` (colorId → RGBA). The egg `ColorMapper` tints the burst/ray sprites per rarity (the egg body + white flash stay their own color).
- Pet battle layout: `Assets/Gameplay/BattleSystem/Pets/Prefabs/PetBattler.prefab` → `PetPositionHandler._positions` (first pet offset **(-0.8, 0)** from the hero = left, same ground line; `OrderInLayer` controls depth).
- Pet UI / pick screen: `Assets/PocketRoll/MainMenu/Pets/` (panel bg `#231F2D`, tile frame `ItemFrame_Square_*`, selected-state checkmark in Green_2 `#C5E53C`).

### Extracting Unity `.anim` keyframes
- `.anim` files hash the `m_FloatCurves` attribute/path ints, BUT keep readable curves in **`m_EditorCurves`** with real attribute names (`m_LocalScale.x/y`, `localEulerAnglesBaked.z`, `m_IsActive`, `m_Color.a`) + `path` (object name). Parse those `time`/`value` pairs to reconstruct the exact motion. Clip length = `m_AnimationClipSettings.m_StopTime`.
- Colors via ColorMapper resolve through a chain: rarity name → `colorId` (ColorMapperPresets) → RGBA (ColorManager.asset). Resolve the whole chain — don't eyeball.

---

## Assets & build

### PNG → WebP is NOT automatic in dev
- **Expected:** the `components` skill says "the build converts PNG→WebP automatically,"
  so I imported `assets/UI/Foo.webp` after only copying `Foo.png`.
- **Actual:** webpack resolves the literal `.webp` path. The conversion is a *separate
  offline step* (`scripts/compress-assets.js`, using `sharp`) that produces committed
  `.webp` files. No `.webp` on disk → `Module not found`.
- **Rule:** after copying a `Foo.png` into `assets/`, generate the webp before importing:
  `sharp("assets/UI/Foo.png").webp({quality:70}).toFile("assets/UI/Foo.webp")`
  (or run `node scripts/compress-assets.js` to convert everything). Then import `.webp`.

### The dev bundle includes EVERY playable
- **Actual:** `src/index.ts` / `TypePicker.ts` use `require.context` to pull in all
  `src/playables/*/index.ts`. A broken sibling playable breaks the whole compile, even
  when you're running a different `--type`.
- **Rule:** keep all playables compilable. The `?type=<name>` URL param (set by the dev
  TypePicker dropdown) switches which one runs without restarting the server.

### Running `--type <x>` for a non-`board-fight` type can leave the bundle broken
- **Expected:** `npm run dev:variant -- --type component-test demo dev` would just build.
- **Actual:** the bundle still imports `board-fight`, which depends on files that only its
  own dev build produces:
  - `src/playables/board-fight/variants/*.generated.ts` — gitignored (`*.generated.ts`);
    created by `node src/playables/board-fight/scripts/codegen.js --all <variant>`.
  - `assets/Spine/Main_Character.build.json` — created by copying `Main_Character.json`
    (variant-build does `cp` of the full json in board-fight dev mode).
- **Rule:** if compiling with a non-board-fight type on a fresh checkout, first run
  board-fight codegen and create the build.json, or the import graph won't resolve.

### A stale `--type` leaves the no-arg default broken
- `dev:variant --type X` writes `X` into `build.json` (`app` + `defines.PLAYABLE_TYPE`).
  If you later delete playable `X`, the no-arg default load errors. Restart the dev server
  with a real type. `build.json` is restored on clean server exit (SIGINT/exit handler).

---

## Components library (`components` skill)

### Some color `Bg` parts already bake in the border + 3D socket
- **Expected:** to get a bordered "juicy" button I needed to layer Bg + Border + a dark
  socket sprite behind.
- **Actual:** `Button_01_Mian_l_Bg_Green` already includes a dark outer border, a top
  highlight, and a 3D bottom lip. And `Button_01_Mian_l_Bg_Border` is NOT a colored frame —
  it's a semi-transparent light *inner-bevel gloss* overlay.
- **Rule:** don't assume `_Bg` + `_Border` = "fill + frame." **View the PNG** (`Read` the
  file — they're small 9-slice source tiles) before deciding how to layer.

### To match a visual reference, look across button *families*, not just colors
- The look in the reference (lime fill + thick dark-green frame) wasn't a color variant of
  the `Mian` family at all — it was a different family: `Button_Convex_Rectangle_01_Green`,
  a single sliceable component with border + pocket baked in.
- **Rule:** when hunting for a specific look, grep the manifest by color *and* by family
  (`Mian`, `Convex`, `Border_Rectangle`, `Frame`, …), then `Read` candidate PNGs to confirm.
  A single well-chosen component often beats hand-layering three.

### The CLI flow that works
1. `node scripts/components-cli.js use "<Name>"` → `{ file, border, variableName }`
   (or `ambiguous` → ask which size; `not-found` → confirm name; `refused` → don't wire it).
   One call handles every case — `use` calls `lookup` internally.
2. Copy `Components/<file>` → `assets/UI/<dest>.png`, **generate the `.webp`** (see above).
3. Import the `.webp` bound to `variableName`; `await Assets.load(data)` for a real Texture
   (board-fight convention), then `makeNineSlice({ texture, border, width, height })` if the
   border is non-null. `makeNineSlice` lives in `@shared/nineSlice` and maps Unity's
   `{left,bottom,right,top}` to PIXI's slice widths.

---

## PIXI / scene patterns (board-fight)

### NineSliceSprite sizing & centering
- `NineSliceSprite` origin is top-left. To center it like a `Graphics` roundRect drawn at
  `(-w/2,-h/2)`, set `.width`/`.height` (these re-slice, they don't just scale) and
  `.position.set(-w/2, -h/2)`. Do the sizing in the scene's `layout`/`layoutScene` so it
  survives resize; create the sprite once (placeholder size) in `enter()`.
- Scenes implement `@shared/Scene` (`enter`/`exit`/`update`/`pause`/`resume`/`layout` +
  `container` + `done`). `enter()` is async — load textures there.

### PIXI v8: setting `sprite.width`/`height` SETS scale
- `sprite.width = N` changes the sprite's *scale* to hit that size. A per-frame "breathing"
  loop that did `sprite.scale.set(~1)` reset the laid-out size to the texture's NATIVE size
  → hit bounds ballooned to full-screen and stole pointer events from neighbours (wrong egg
  opened on tap).
- **Rule:** after sizing, store `baseScale = sprite.scale.y` and animate relative to it
  (`scale.set(baseScale * factor)`); re-derive on layout/resize.

### `SceneManager.push(scene, 'replace')` only HIDES the previous scene
- It does NOT call the previous scene's `exit()`. `exit()` / `destroyActors()` run only on
  `pop()` or `seamlessReplace()`. So scenes accumulate (hidden) and e.g. a `FightEngine` keeps
  ticking under a later scene. Tolerable when the flow ends on a terminal scene (end card,
  page discarded on install) — but don't rely on `exit()` firing on a 'replace'.

### Responsive sizing: cap by a height fraction, not a fixed px
- Sizing by `gap = min(width/(n+1), 180)` made eggs/pets tiny on wide/landscape windows (the
  fixed 180 cap). Cap by the short side instead: `min(width/(n+1), max(170, height*0.26))`.
- Bound any "above the subject" text so it can't collide with a top title on short/wide
  aspects (e.g. `bannerY = -min(gap*2, height*0.30)`).
- Use `@shared/autoSizeText` for any text that must fit a width (titles; rarity word inside a
  banner) so long words ("LEGENDARY") don't overflow.

---

## Verifying a visual playable

- **Logic IS covered by node test harnesses** — `npm run test:shared` / `test:board-fight` /
  `test:clash-royal` / `test:dice-blackjack` / `test:end-card` (each → a `__tests__/run.mjs`)
  + `test:components` (`scripts/components/*.test.js`), plus per-playable batch sims
  (e.g. clash-royal `_batchsim.ts`).
  What has **no unit coverage is VISUAL correctness** — verify that by booting the dev server
  and SCREENSHOTTING with Playwright (`tests/<type>.spec.ts` is the boot smoke: canvas mounts +
  no console errors; `tests/pw/*.mjs` are the flow/screenshot scripts).
- Sub-frame VFX (a ~0.1s flash/burst) is unreliable to catch in a single screenshot; take a
  dense burst of frames, or reason from the extracted keyframes.
- To iterate fast on a DEEP scene (e.g. the fight, past a slow gacha), add a **temporary**
  director shortcut gated on a URL param (`?only=fight` → push that scene first, `return`),
  screenshot, then **remove it before committing**.
- The egg flow's open-order guard + long reveals make full-flow Playwright runs flaky — open
  eggs strictly in order with generous waits, or use the shortcut.
- The dev server rewrites `build.json` (`PLAYABLE_TYPE`) on start — `git checkout build.json`
  before committing; never commit it. (Subagents also tend to append to THIS file uncommitted;
  keep lessons edits intentional.)

---

## egg-summon playable

### PocketRoll pet Spines have no hit/death animations
- **Expected:** pets could be on either side and take damage from enemy attacks.
- **Actual:** PocketRoll pet Spines export only `Idle`, `Move`, and `Basic_Attack` — there are no `TakeHit` or `Death` animations. Targeting a pet with an enemy attack throws a missing-animation error and breaks the fight.
- **Rule:** in any egg-summon fight, place the pet on the player side and have enemy attack steps target only the hero (actor index 0). Never target the pet.

### New playable types must define their own hero SpineAssets bundle
- **Expected:** a new playable could import `Main_Character.build.json` the same way board-fight does.
- **Actual:** `assets/Spine/Main_Character.build.json` is gitignored — it is produced only during a board-fight build/dev run (`cp Main_Character.json Main_Character.build.json`). On a clean checkout it does not exist, so any import of it fails.
- **Rule:** define the hero `SpineAssets` bundle for the new playable by importing the committed `assets/Spine/Main_Character.json` directly (not the `.build.json`). This decouples the new playable's build from board-fight's dev artifacts.

### The real egg summon — assets + animation (extracted; do not re-invent)
- It is ONE cream speckled egg (`Pets_Summon_Icon.png`); **rarity is shown by shake-count + ray/burst COLOR, not egg color**. (We use a rarity-tinted glow behind each of our 3 eggs to keep the bronze/silver/gold cue.)
- **Shake** (`SummonEgg_Shake.anim`, 0.5s @60fps): squash/stretch beat `scaleX 1→1.2→0.8→1`, `scaleY 1→0.9→1.3→1`; **rock** `localEulerAnglesBaked.z 0→-3°→+3°→-2°→0` (it ROCKS, not slides); a white egg-flash 0.083–0.167s; **3 concentric** rarity-tinted bursts (scale 0→1 while alpha 1→0) staggered at 0.017/0.05/0.083s. Motion is IDENTICAL every shake — only the color escalates.
- **Escalation:** `LootBoxPetEggAnimation` loops the shake `i=0..rarity`, calling `ApplyColor((Rarity)i)` each pass and waiting `_animationDelaysForRarity` (Common 0.5, Great 0.6, Rare 0.4, Epic 0.6, Legendary 0.7, Mythic 0.5 s). So Mythic = 6 escalating shakes (grey→…→red).
- **Open** (`SummonEgg_Open.anim`, 1.333s) — the EXACT choreography (replay it one-for-one; clip seconds). The egg-summon reveal mirrors this in `showRevealScreen` via a single master tween (`ct = t*1.333`, sampleCurve per element):
  - `0–0.25` `Chest_Holder` squash `1→0.9→1.2→0.842→1`; the rarity rays (`Rays_Rarity_Holder_Front/Back`, the 9 shake rays) **fade out** (scale+alpha →0 by 0.25).
  - `0.25` `Chest_Closed` HIDES (egg vanishes — NO lingering shell); `GlowWhite` flashes (gone by 0.333); `GlowWhiteStar` starts.
  - `0.25→0.5` white star scales `0→0.5→peak 1`; **3 `GlowCircle`s pulse staggered** (+0.05s each, low α 0.2); the **8 `Rays_Holders_onOpen/Rays` switch on ONE-BY-ONE** (0.283 + i·0.0334, i.e. 0.283→0.517).
  - `0.5→0.583` open-rays fade (parent α 1→0 at 0.5–0.55); white star shrinks to 0 by 0.583.
  - `0.55` `Burst_Glitter` (one-shot gold) + `Loop_Glitter` (continuous) turn on (stay on into idle).
  - `0.583→0.833` `PetBackGlow` grows; rarity rays RETURN behind the pet (idle re-enables them).
  - `0.833→1.083` `PetReward_Holder` pops `0→1.1→1`.
  - `0.917→1.25` `Summon_Rarity_Title` pops `0→1.05→1`; `1.083→1.333` `Chest_Reward_Name` pops `0→1.05→1` (**name LAST**).
  - Sustained (Idle loop): rarity rays static behind the pet + `Loop_Glitter` (continuous gold twinkle) — the rays do NOT pulse in the clip (life = glitter + a gentle pet bob).
- **Rarity colors** (ColorManager `*_2` palette): Common `#CCCAE8`, Great `#C5E53C`, Rare `#4FD9F4`, Epic `#D671FD`, Legendary `#FFC600`, Mythic `#FE4863`.
- **Reveal layout:** see the authoritative "Reveal screen matches the recording" entry below (rarity PILL + name) — that is the current design.

### Pet Spine skins: there is no `'default'`
- Pet Spines have no `'default'` skin → passing `skin:'default'` throws "Skin not found". Use the pet's real skin name (Glacidrake → `'Glacidrake'`; its skins are `Glacidrake` / `Evolution_Glacidrake`).

### Fight pet size, position & render order (match PetBattler)
- The game puts the pet as a **small companion (~half the hero's height) in the far LOWER-LEFT (foreground)**, clear of the hero (`PetPositionHandler` offset (-0.8,0)). It is NOT hero-sized or in front of the hero.
- The Glacidrake Spine is intrinsically LARGE: `scale ≈ 0.045` ≈ half the hero (hero ≈ 0.12). Don't reuse the boss/enemy scale (0.12–0.16 → covers the hero).
- Place it `xFrac ~0.12, yFrac ~0.96` (lower-left), hero `xFrac ~0.36`.
- **Render order:** `FightEngine` depth-sorts ENEMIES by Y but originally added PLAYERS in array order ([hero, pet]) → the (wide) pet drew ON TOP of the hero. Fixed by depth-sorting players by `homeY` too (smaller yFrac renders behind); single-hero board-fight fights are unaffected.
- **`return: false`** on an attack leaves the actor at its lunge position (for hero combo chains). A companion's attacks must **omit `return`** (default = walk home) or the pet lunges in and stays, covering the hero.

### Authentic interactions only — the game is an idle/auto-battler
- You do NOT tap to fight in PocketRoll — combat auto-resolves. So don't add a tap-to-attack
  (it would misrepresent the game). The real tappable beats are: **summon** (tap egg/draw),
  **roll the dice** (the board waits for a Roll-button tap — that's why `BoardScene` can't be
  reused headless), and **claim rewards** after a battle. The egg-summon flow now uses all
  three: egg tap → tap `RollButton` (reused from board-fight, '3d' mode) → tap CLAIM on a
  victory chest (`ClaimRewardScene`). Each has a ~6s idle auto-fallback so the ad never
  dead-ends before the CTA.
- **PIXI gotcha (again):** don't read `sprite.height` to derive a target scale AFTER setting
  `scale.set(0)` for a pop-in — the height getter returns `scale.y * texture.height` = 0, so
  the pop computes a 0 target and the sprite never appears. Capture the target scale BEFORE
  zeroing. (Same family as "setting width/height SETS scale".)

### The fight shows the BOARD (dimmed) beneath it — not a black void
- In the live game, combat plays in a panel over the TOP ~55% of the screen and the
  **board stays visible (dimmed) in the lower ~45%** (with the speed/ability controls).
  The battle background art has a slanted bottom edge designed to sit over the board.
- Our `FightScene` originally masked the battle to the top ~55% over a near-opaque black
  dim (`0.85`) with nothing behind → the bottom looked BROKEN (solid black). Fix: render
  the real board image (`assets/Backgrounds/Board1Asset.webp`) as a full-screen backdrop
  behind the battle, dim it ~`0.58`, and put the (opaque) battle panel on top. The board
  shows through dimmed below the panel.

### Fill the fight's board area with a SKILL BAR (reuse board-fight skills)
- The live battle shows the player's skill icons (+ an `x1` speed control) in the board
  area beneath the combat. Reuse board-fight's skill catalog (`catalog/skills/*` →
  `SkillConfig` with a webp `icon`) + `RARITY_COLORS` (from `../board-fight/skills`) to
  render icons (rarity-coloured rounded square + sprite). `FightScene` lays a centred row
  just below the battle panel + a drawn `x1` pill bottom-left. Since our fight is auto,
  give each icon a staggered **charge sweep** (a masked dark overlay receding bottom→top)
  + a white "ready" flash on wrap so the bar looks active without real input.
- **Both hero AND pet cast skills** (not just melee): use `{ type:'skill', side:'player',
  actor, skillId, target, damage }` steps. Only `fireballBarrage`, `chainLightning`,
  `shurikenFlurry` have real VFX handlers — register them with side-effect imports
  (`import '../board-fight/fight/skillVfx/<id>'`) or they fall back to plain damage. A
  skill step plays its VFX from `ctx.actor`'s position, so the pet (actor 1) can cast too
  Wire `engine.onSkillActivated = (id) => flash the matching bar cell`. Slow the fight by
  inserting `{ type:'wait', ms }` steps between beats.
- The repo has NO ice VFX (only fire/lightning/shuriken). For the ice dragon Glacidrake,
  custom ice skills were added in `egg-summon/iceSkillVfx.ts` (registered into the shared
  registry, drawn with Graphics — no new sheets): `frostBreath` (cyan ice-shard barrage)
  and `glacialStrike` (EPIC one-time finisher: ice comet → frost-nova flash + shake →
  boss encased in an ice block → shatter). Icons extracted from the game's
  `SkillTree/.../Deadly_Ice.png` + `Skills/Sprites/Frost_Nova.png`.
- **Accuracy note (important):** Glacidrake's REAL in-game skill (from `Pet Config/
  Glacidrake_Skill 1.asset` + `Localization/translations_en.json`) is *"deal Ice DMG to all
  enemies and apply 'Chill'; chance to apply 'Freeze'."* The game's actual VFX is a Unity
  particle prefab (`Glacidrake_Action_Animation.prefab`) — NOT portable to PixiJS — and the
  pet Spine has no skill animation. So the VFX is necessarily a recreation; to stay accurate
  we use the game's real ICONS + its real STATUS WORDS on screen ("CHILL" on the barrage,
  "FREEZE!" on the encase) and game-accurate `name`/`description` (no invented skill names).

### Use `seamlessReplace`, not `push('replace')`, for asset-loading transitions
- `SceneManager.push(scene,'replace')` HIDES the previous scene immediately, THEN awaits the
  new scene's async `enter()` (which loads spines/backgrounds) → a **black gap** for the
  load duration (most visible board→fight). `seamlessReplace` adds the new scene behind the
  old, runs `enter()` while the old stays visible, then removes the old → no black frame.
  Use it for every transition into a scene that loads assets.

### Playable pacing — get to the payoff fast, don't leave the viewer passive
- The mythic reveal should land by ~5s, not ~8s. Compress the escalating egg build
  (`BUILD_SPEEDUP` plays the full 0.5s shake clip inside a shortened per-tier window) and
  add an **auto-tap fallback** (~1.8s) so a passive viewer still reaches the reveal quickly
  (the manual tap still works; `openEgg` guards against a double-open). A stronger egg
  throb + faster hand-tap loop make the first interaction read as urgent.

### Reuse the REAL board — not a placeholder
- The board beat composes board-fight's real `Board` (board1Config bg + tiles + camera; note it exposes `.sprite`, not `.container`) + `BoardDice` (3D dice; self-ticks via `throw(d1,d2)`) + the hero Spine hopping (replicate `BoardScene.updateMovement`: normal hop 0.125s/25px, major final hop 0.28s/75px, parabolic arc, `board.tileToScreen` + `board.focusOnTile` each frame). Compose these with YOUR own hero bundle. Do NOT reuse `BoardScene` whole — it needs a RollButton tap and imports board-fight's `heroBundle` → the gitignored `Main_Character.build.json`.

### The summon-screen first screen — match the live Pets/Summon view
The user's reference is the live game's **Pets → Summon** screen (egg on a pedestal,
not 3 eggs in a row). `EggSummonScene` renders that screen with a **single egg, one tap**:
the egg builds up through EVERY rarity tier (escalating shake-colour grey→…→red) and
resolves on the **mythic dragon** (`script.fighterIndex`), then **auto-advances** straight
to the board/fight (no "Tap to Continue", no per-pet pick screen). Pacing decision: 3
sequential eggs + a continue-gate between each was too many taps + too much passive
waiting for a ~22s ad; one tap → one big build → one payoff is tighter. Keep the egg's
resting glow NEUTRAL (don't pre-tint to the rarity) so the rarity stays a surprise.
The downstream `PickFighterScene` is now unused (dropped from the director).
- **Real assets (extracted from `Assets/PocketRoll/MainMenu/Pets/Pets_Images`):**
  `SummoningStatue.png` (the teal egg-guardian, behind the egg), `Cover_1..4.png` (the
  green glowing pedestal rim/pad — `Pets_Panel.prefab` layers these), `fire_loop_1_mid.png`
  (the green summoning flame — a **5×5 sheet, 1280², 256px cells, 25 frames**; slice + cycle
  it, see `TorchFlame.ts`). The egg + reveal sprites we already had.
- **NOT in our source checkout (updated in the live build after it / live in atlases):**
  the **purple stone-brick arch wall** behind the pedestal, the **lobby top-bar currency
  icons** (purple gem / gold coin), and the **5 bottom-nav icons**. `Pets_Panel.prefab`
  still references the OLD bg (`Pets_BG_View.png` = a forest; `PetDungeon_BG.png` is also a
  forest) — neither matches the live stone arch. So those are **recreated** (brick wall +
  arch in `drawBackground`, HUD chrome in `SummonHud.ts`) to match the recording. The
  egg-currency icon reuses the real egg sprite.
- **Full HUD was requested** (`SummonHud.ts`): top currency bar (pet-eggs/gem/coin),
  Lv + XP bar, the `3x / 1x / 10x Draw` buttons (gold = `Button_Convex_Rectangle` family;
  the 1x/10x show a gem cost), `Collection | Summon` tabs (Summon selected/gold), and the
  5-icon bottom nav with the Pets cell raised/purple. It's `eventMode='none'` so it never
  eats the egg tap, and rebuilds in `layout()` for resize.
- **Reveal screen matches the recording exactly:** full-screen **paw-print** backdrop
  (drawn), a rarity **PILL** (rounded, rarity-tinted — `Common/Rare/Mythic`, title-case,
  NOT "MYTHIC!!!"), the pet **name** below it, the pet with a **gold radial glow + sparkle
  burst**, and a pulsing **"Tap to Continue"** at the bottom.
- To verify a non-board-fight type locally you must run with `node_modules/.bin` on PATH
  (`PATH="$PWD/node_modules/.bin:$PATH" node scripts/variant-build.js --type egg-summon demo dev`)
  — bare `node scripts/variant-build.js …` fails with `playable-scripts: command not found`.

## Audio (egg-summon)
- egg-summon reuses board-fight's `sfx.ts` WebAudio engine (one decode + AudioBufferSourceNode
  per play, gated on first user gesture). egg-summon owns a thin `audio.ts` wrapper with the
  real game clips: `SFX_Crack` (egg crack, pitched up per shake bump), `Pet_Summon_End` (reveal
  sting), `Level1_Compressed_Theme` (board BGM), `Level1_Boss_Theme` (= Stage_1 `Level1_Boss.wav`,
  the fight BGM), `Chest_Open` + `Reward_Received` (claim).
- GOTCHA: `setMusic()` will NOT replace a track that's already playing (`startMusicIfPending`
  early-returns when `musicSrc` exists). To SWITCH BGM (board→boss→board) you must
  `pauseMusic()` first, then `setMusic()`. The `playBoardMusic/playFightMusic` helpers do this.
- The board-fight `FightEngine` already fires battle SFX (charge/swordHit/dodge/death/damage),
  so egg-summon's FightScene only needs to set the BGM — hit sounds come for free.
- Real game audio lives in `~/Desktop/RougeLegend/pocketroll/Assets/**/Audio`
  (Pets/Audio, Gameplay/BattleSystem/Audio, Gameplay/Board/Stage_1/Audio, Gameplay/Audio).
  Re-encode WAV→mp3 with ffmpeg: music `-ac 1 -b:a 48k` (matches existing theme), SFX `-ac 1 -b:a 96k`.

## Skill-bar charge overlay (egg-summon FightScene)
- BUG: the board-fight-style charge sweep (a Graphics rect masked by a separate
  rounded-rect Graphics, `overlay.mask = chargeMask`) rendered as a SOLID GREEN
  square on the slot for the cast's duration (RGB ≈ (0, 89, 0) = pure green at
  exactly CHARGE_ALPHA 0.35). The masked-overlay path produced a green-channel-only
  artifact in PixiJS 8 (only visible here because egg-summon's bar sits on an opaque
  backdrop; board-fight hides it on black). It looked like "green on the skill for a
  fraction of a second when used."
- FIX: dropped the masked bottom-up charge sweep entirely. Cast feedback is now a
  pulse (scale bump) + a maskless additive white roundRect flash (alpha 0.55 → 0).
  No `.mask` = no channel artifact, no hole. Removed `onSkillCharging` wiring.

## egg-escalate (two-fight + boss-land CTA)
- Real battle pets live in `~/Desktop/RougeLegend/pocketroll/Assets/Gameplay/BattleSystem/Pets/<rarity>/<Name>/`
  (Common→Mythic, ~24 pets). Each has the same Spine layout as Glacidrake
  (`<Name>.json` + `<Name>.atlas.txt` + `<Name>.png` + Pet Config). Extract like
  Glacidrake: copy → png→webp (sharp) → `resize-spine-atlas.js <atlas> <scale>`
  (positional args!) to shrink. Boneclaw at scale 0.35 → ~136KB webp (1367x1131),
  comparable to Glacidrake. `strip-spine-json.js` has NO CLI flags (hardcoded to
  assets/Spine/ roots) — don't try to pass it args.
- GOTCHA: `SpineCharacter.create()` defaults skin to `'default'` and ALWAYS calls
  `setSkinByName(skin)`. Enemies (slime/wolf/skeletonKing) all have a `'default'`
  skin so they're fine, but battle PETS don't — Boneclaw's skins are
  `BoneClaw` / `BoneClaw_Evolution`. Creating a pet Spine without passing
  `{ skin }` throws "Skin not found: default". Always pass `{ skin, animation }`.
- Boneclaw (and the other extracted pets) only have `Idle` / `Move` / `Basic_Attack`
  anims — give them MELEE fight steps, not skill VFX (skills need registered VFX).
- The shared `EggReveal` (egg-summon/eggReveal.ts) draws a STATIC pet sprite from a
  Texture — it can't show a Spine. To reveal a Spine pet from the crack flow,
  `EggCrackScene` got a gated `spineReveal` option that pops the live rig out of the
  burst + a COLLECT button, instead of `EggReveal.run()`.
- 5MB CAP / TREE-SHAKING: a self-contained playable inlines every asset, so the
  only way to exclude bytes is for the asset to be truly unreferenced in the
  build's module graph. Gating a runtime call (`if (x) loadSummonTexture(...)`)
  does NOT drop the asset — the static reference keeps it bundled. To actually
  shed the summon-pedestal sprites (statue+torch ~480KB), egg-escalate uses a
  dedicated crack scene that imports NO summon art (draws the altar with
  Graphics) instead of reusing EggCrackScene. AppLovin/Unity/Moloco ship the raw
  HTML (must be <5,242,880 B); Google ships a zip (far smaller). Check exact
  bytes with `stat -f%z`, not `ls -lh` (which rounds 4.97M and 5.04M both to "5.0M").

---
name: components
description: Use when adding a UI component (button, frame, slider, label, popup, title, icon, 9-slice border) from the Components/ library into a PIXI playable scene.
---

# Using the Components library

`scripts/components-cli.js` does the mechanical work; you resolve intent and place code. UI components only — backgrounds, boards, and characters (Spine) are out of scope.

## Critical: load textures before building sprites

In PIXI v8, `Texture.from(<imported asset url>)` returns an **un-loaded** texture — the Sprite/NineSlice renders blank/white while any `Text` beside it still shows. Always `await Assets.load(url)` first and build from the returned `Texture`. `npm run check:textures` flags violations and runs automatically as `prebuild`. See `dice-blackjack/LoadBar.ts`, `BlackjackScene.ts`, and `clash-royal/ui/CoinMeter.ts` for the pattern.

## Steps

1. **Refresh the index if needed.** Run `npm run audit:components` if `Components/_index/manifest.json` is missing, art was just added, or `rename:components` was just applied (the rename leaves the manifest's file paths stale).

2. **Resolve + get wiring data in one call.** Run `node scripts/components-cli.js use "<Name>"`. `use` calls `lookup` internally, so this single command handles every case:
   - `status: "ok"` → `{ id, file, border, variableName }`. `file` is the **source** path relative to `Components/` (e.g. `Button/Button_Main_01_Blue.png`) — you'll copy it into `assets/` next and import from *there*, not from `file`.
   - `status: "ambiguous"` → name exists at multiple sizes. **Show the candidates and ask which size** (e.g. 256 vs 512). Never pick silently.
   - `status: "not-found"` → ask the user to confirm the name or open `Components/_index/names.html`.
   - `status: "refused"` → **do not wire it.** Cite the blocking issue. For a multi-part widget, if ANY part is refused, refuse the whole assembly.
   - `status: "grammar-too-new"` → tell the user to update the tooling; stop.

3. **Copy the PNG into assets/, then generate its `.webp`.** Copy `Components/<file>` into the appropriate `assets/UI/` subfolder. The dev build does **not** auto-convert — webpack resolves the literal `.webp` path, so you must produce the WebP yourself or the import fails with `Module not found`:
   ```bash
   # one file:
   node -e 'require("sharp")("assets/UI/<dest>.png").webp({quality:70}).toFile("assets/UI/<dest>.webp")'
   # or convert everything: node scripts/compress-assets.js
   ```

4. **Write the code.** Import the asset under the **canonical variable name** (`variableName` from the CLI) and use a **short local alias** at the usage site (`bg`, `border`, `innerBorder`, `focusGlow`).

   ```ts
   import { Assets, Sprite, Texture } from 'pixi.js';
   import bgData from 'assets/UI/<dest>.webp'; // <dest> = step 3 destination

   const tex = await Assets.load<Texture>(bgData); // decode BEFORE building the sprite
   // border non-null → 9-slice; border null → plain Sprite:
   const bg = makeNineSlice({ texture: tex, border: <border>, width, height });
   container.addChild(bg); // container = the scene's `ui` container
   ```
   For a widget class with a synchronous constructor: give it a `static async preload()` that `Assets.load`s its urls into a module-level texture map, await it before constructing the widget, and build sprites from the loaded textures (see `clash-royal/ui/CoinMeter.ts`). **If the target container is ambiguous, ask.**

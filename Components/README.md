# Components — UI Asset Library

The source library for UI art (buttons, frames, sliders, labels, popups, titles, icons).
Not loaded at runtime directly — components are copied into `assets/` per playable.

## Quick use

1. Run `npm run audit:components` (regenerates the index).
2. Open `Components/_index/names.html` to find the component name, or `gallery.html` for full QA.
3. Use the `components` skill, or `node scripts/components-cli.js lookup "<Name>"`.
4. Copy the PNG into `assets/UI/`; the build converts to WebP.
5. Wire it with `makeNineSlice` (see `src/shared/nineSlice.ts`) using the meta border.

## Naming

Canonical ID = the file's path under `Components/` without extension. Names follow the grammar
below. To rename: `npm run audit:components` writes `_index/rename-map.csv`; review/edit it, then
`npm run rename:components -- --confirm-count=<rows> --expect-csv-sha256=<hash from the file header>`.
Renaming is safe only while no code references `Components/` (the apply step enforces this).

<!-- generated from grammar.json — do not edit by hand -->
## Naming grammar (v1)

**Categories:** Button, Frame, Slider, Title, Label, Popup, UI, Icon

**Size:** Small, Large

**Part:** Background, Border, InnerBorder, Fill, FocusGlow, Line, Gradient, Level

**Color:** Blue, Green, Red, Mint, Navy, White, Yellow, Pink, Orange, Gray, Dark, Brown, Sky, Purple, Gold, Silver, Bronze

**State:** Focus, Locked, Open, Light

**Required slots:** Button=[Part]; Frame=[Part]; Slider=[Part]; Popup=[Part]; Label=[Part]; Title=[]; Icon=[]; UI=[]

**Conformance:** A category with required slots (Button/Frame/Slider/Popup/Label) is strict: every token after the subtype must map to a known slot, else the name is non-conformant. Open categories (empty required slots: Title/Icon/UI) are lenient: they additionally permit free-form descriptive trailing tokens that fit no slot (e.g. Icon_Picto_Book, Icon_Item_Medal_Bronze). This asymmetry is intentional — icon/title art is too open-vocabulary to enumerate.


## Visual sign-off

Track verification in `_index/signoff.md`: one row per category. Open `gallery.html`, spot-check
the deterministic sample (10 evenly-spaced items) plus every blocking-issue item, and sign with
name + date. A category re-needs signing when `npm run audit:components` reports its hash changed.

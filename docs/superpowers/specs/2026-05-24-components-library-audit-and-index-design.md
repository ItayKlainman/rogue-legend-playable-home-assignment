# Components Library — Verification, Rename & Index

**Date:** 2026-05-24
**Status:** Approved design (hardened after red-team review), ready for implementation plan

## Problem

`Components/` is a freshly-committed UI asset library (~1,250 PNGs + ~1,270 Unity
`.meta` files, across 11 categories). It is the **source library** for UI art — separate
from the runtime `assets/` folder that the PixiJS playables actually load.

### Inventory (1,249 PNGs, all UI elements — no backgrounds/boards/characters)

| Category | Count | What it is |
|---|---|---|
| Icon_ItemIcons | 357 | Item/reward icons — coins, chests, medals, gifts, skill icons, drops |
| Icon_PictoIcons | 240 | Simple pictograms — book, trophy, bell, timer, info, card, buff |
| Frame | 203 | Containers/panels — item/list/stage/flag/chapter frames |
| Slider | 105 | Progress/XP bars — fill, border, level states, color variants |
| Button | 86 | Buttons + tabs — main (s/l, many colors), circle/rectangle bordered, tabs |
| UI_Etc | 71 | Misc — toast messages, status bars, badges, stars, switches, tutorial focus |
| Icon_Chest | 66 | Chests — wood/silver/gold/premium/special, closed/open/open-effect |
| Title | 64 | Header decorations — ribbons, flags, line dividers (color variants) |
| Label | 26 | Tags — grade labels (tapered), flag labels (bg/border/gradient) |
| Popup | 17 | Popup box parts — bg, border, inner border, gradient top, list layouts |
| Icon_ShopItem | 14 | Shop offers — coin packs, gem packs, silver coin tiers |

Two structural notes: (1) most entries are **parts, not whole widgets** — a button is layered
from `_Bg` / `_Border` / `_InnerBorder` / `_FocusGlow` pieces (this is exactly why 9-slice
`spriteBorder` data matters); (2) the 4 icon sets carry size subfolders (`Original/512/256/128`),
the other categories are flat.

### Goals

1. **See that every image looks good** — review ~1,250 PNGs for visual quality (see
   *Visual sign-off*, below — this is a defined process, not a hope).
2. **Trust the `.meta` files** — they are the spec source, not runtime data. The dev
   workflow reads each meta's `spriteBorder` and passes those Unity values into
   `makeNineSlice` (see *9-slice wiring*). A broken/misparsed meta = a broken 9-slice.
3. **Rename to descriptive, consistent names + build a shared index** — so components are
   easy to find and use and the team shares one vocabulary ("same language").

### How components are used (confirmed from the repo)

The playables are **PixiJS + `@smoud/playable-sdk`**, built by `scripts/variant-build.js` /
`build-all.js`. They load from `assets/` (`.webp`+`.png` pairs, **no metas**). The build
inlines images as base64 via webpack (`declarations.d.ts`) and converts PNG→WebP with `sharp`
(`scripts/compress-assets.js`). Each playable has a `catalog/*.ts` pattern: typed modules
that import an asset and export a bundle with metadata (e.g. `defaultScale`).

End-to-end workflow this spec supports:

> pick a component → confirm it looks right → trust its `.meta` (esp. `spriteBorder`) →
> use its canonical name → copy the PNG into `assets/` → pass the Unity border values into
> `makeNineSlice`.

## Threat model for the rename (corrected)

This repo is **not** a Unity project — nothing here reads GUIDs. The real risk of renaming
is **string references**: once a component is copied into `assets/`, imported in code, linked
in a doc, or cached by the skill, its name is a hard-coded string and renaming breaks it.
The Unity-GUID-preserves-references fact is true but irrelevant to *this* pipeline; it is a
footnote, not the safety argument.

Actual safety rests on three things:

1. **Rename before any reference exists.** Verified by a **pre-flight gate** (below).
2. **A pre-flight reference scan**, run and recorded before applying. The threat is **code**
   references (imports, `assets/` copies, build configs), not prose — so the scan is **scoped to
   code paths** (`src/`, `scripts/`, root build configs: `*.json`, `*.html`, `*.ts`, `*.js`) and
   does **not** search docs at all. This is cleaner than maintaining a doc-exclusion list that
   rots (the old approach hardcoded one spec path). It also matches the literal
   **case-sensitive** `Components/` (capital `C`, trailing slash) — **no `-i`** — so an unrelated
   lowercase `components/` (e.g. a vendored `react-components/`) can't false-positive.
   Implemented in **Node** to avoid shell-quoting traps (the obvious `--include='*.{ts,…}'`
   brace-glob is a silent no-op inside quotes — it matches nothing). Verified-correct shell
   equivalent (tested 2026-05-24, finds a planted code ref):
   ```sh
   grep -rnI --include='*.ts' --include='*.js' --include='*.json' --include='*.html' \
     --exclude-dir=node_modules "Components/" \
     src scripts build.json package.json tsconfig.json 2>/dev/null
   ```
   (The Node implementation enumerates code roots + root config files directly, sidestepping
   shell glob quirks like zsh's `nomatch` error on `*.html` when root has none.)
   **Result on the real repo 2026-05-24: zero hits.** Ships as `scripts/check-component-refs.js`;
   apply runs it and **aborts on any hit**. Its own test plants a reference and asserts the scan
   catches it (guards against the gate silently no-op-ing — the original brace-glob bug).
3. **A human sign-off** that no *external* surface (Notion/Jira/Figma/Slack) references the
   current filenames — the grep can't see those. Recorded in the sign-off checklist.

## Scope

Whole library, all 11 categories, one pass. Re-runnable as the library grows.

## Approach

A re-runnable Node script that (a) audits every PNG↔`.meta` pair, (b) emits a clean name
reference, a QA gallery, a machine-readable manifest, and a fix-it report, and (c) generates
a **review-then-apply** rename mapping. A separate apply command performs the renames. On top
sits a thin **skill** whose deterministic work lives in a small helper CLI.

Chosen over a TypeScript-catalog-first approach (premature; phase 2) and a markdown-only
index (you'd never *see* the images).

### Dependencies

- `sharp` — already a devDependency (image probing).
- **`js-yaml`** — **added.** Unity `.meta` YAML varies by editor version (block vs flow
  `spriteBorder`, platform-override blocks, quoted/unquoted booleans). Hand-rolled regex
  parsing would silently misparse a subset and produce wrong border values — which defeats
  the system's whole purpose. A tiny, correctness-critical dep.

## Architecture

### `scripts/audit-components.js` (audit + generate, read-only)

`npm run audit:components`. Never moves files. **Creates `Components/_index/` if missing**
(`mkdir -p`) so a first run on a clean checkout doesn't fail.

1. **Walk** `Components/` recursively; collect every `.png`/`.Png` and every `.meta`.
2. **Pair** each image to its `<image>.<ext>.meta` (case-insensitive on extension).
3. **Parse meta** with `js-yaml`; extract `guid`, `spriteBorder {x=left,y=bottom,z=right,w=top}`,
   `spritePivot {x,y}`, `spriteMode`, `textureType`, and `folderAsset`. Folder metas are
   excluded from orphan checks.
4. **Probe image** with `sharp`: width/height, channels, and a real-alpha verdict (see below);
   catch corrupt/undecodable; flag 0-byte. Compute **two hashes**: `pngHash` (raw bytes) and
   `metaHash` (over a *normalized* parse of the meta — fields that matter, not byte order), so
   duplicate detection compares the **(pngHash, metaHash) tuple** as a unit.
   **Alpha verdict:** `sharp`'s `hasAlpha` is `true` for any RGBA PNG even if every pixel is
   opaque, so it's insufficient. Use `image.stats()`: `effectiveAlpha = hasAlphaChannel && (alpha
   channel min < 255)`. The `no-alpha` advisory fires when `effectiveAlpha` is false (no channel
   **or** channel present-but-fully-opaque) — that's the real "UI art missing transparency" case.
5. **Classify issues** with severity (see *Issue model*).
6. **Compute proposed name** per file (see *Naming*), applying the conformance rule so
   already-good names are no-ops.
7. **Emit artifacts.** Also write **`proposed-counts.json`** (current per-category totals) and
   diff it against the committed **`expected-counts.json`**, warning on drift.
   **Initial baseline:** on the very first run no `expected-counts.json` exists, so the audit
   emits one from the current scan (seeded by the inventory table) and the setup commit includes
   it — the first run warns against nothing.
   **Update process (defined, not "anyone anytime"):** thereafter `expected-counts.json` is the
   baseline; when components are legitimately added/removed, the `proposed-counts.json` diff is
   reviewed in the same PR and `expected-counts.json` is updated **as part of that human-approved
   PR** — so a silent count change can never pass unnoticed.

### `scripts/rename-components.js` (apply, the only step that moves files)

`npm run rename:components`. Reads the **reviewed** `rename-map.csv` and:

- Requires `--confirm-count=N` matching the number of rows; aborts on mismatch (catches
  "row set grew").
- **Verifies the CSV content hash.** `audit` writes the SHA-256 of the generated CSV into a
  header comment (`# csv-sha256: …`). `rename` recomputes the hash of the rows it's about to
  apply and aborts if it differs from a `--expect-csv-sha256=…` the operator passes (recorded
  from the reviewed file). This catches the case `--confirm-count` misses: **same row count,
  changed `new_name` values** (e.g. audit re-ran between review and apply after a meta edit).
- Re-runs the **pre-flight reference scan**; aborts if any reference to `Components/` now exists.
- Checks for **collisions case-insensitively** (two targets differing only in case collide on
  macOS/Windows); aborts listing them.
- Renames each PNG and its `.meta` as a pair. **Not claimed atomic** — POSIX can't rename two
  files atomically — but **crash-safe/resumable** via a journal (below).

**Rename journal** — `Components/_index/rename-journal.jsonl`, append-only:

- **Header line** written first: `{ csvSha256, confirmCount, startedAt }`.
- **One line per pair**, updated through states: `pending` → `png-done` → `complete`.
- **Resume contract:** on start, if a journal exists, its `csvSha256` **must equal** the current
  CSV's hash — otherwise the CSV was edited mid-flight and the run **aborts** (no half-merged
  result). For each non-`complete` entry:
  - `png-done` → finish the meta rename → `complete`.
  - `pending`, old png present → do the pair.
  - `pending`, old png gone **and** new png present → treat as `complete` (idempotent re-run).
  - `pending`, old png gone **and** new png absent → **abort with a loud error** naming the
    missing pair. This is the "file vanished mid-crash / corruption" case; silently treating it
    as complete would lose a file, so we refuse and let a human investigate.

  A clean finish renames the journal to `…-<timestamp>.done`.
- `audit` independently reports orphan png / orphan meta, so even a journal loss is recoverable.

Both scripts are **resilient**: a bad file becomes a recorded issue, never a crash.

## Outputs

Generated into **`Components/_index/`**. The `_` prefix keeps them out of build asset
compression (`compress-assets.js` skips `_`-prefixed dirs at any depth — confirmed in source).
**These HTML pages are local-only**: they reference images by relative path and are meant to
be opened from a clone. They are explicitly *not* a GitHub-rendered / Pages artifact (GitHub's
web viewer won't resolve the relative image paths). If a hosted version is ever needed, that's
a separate build.

### `names.html` — clean name reference

Each component as **image + its name underneath, nothing else**. Grouped by category, with
filter/search and lazy-loading. The "so everyone knows what each one is called" page. Stays
trivially light.

### `gallery.html` — visual + QA check

- One self-contained page, all assets, grouped into **collapsed-by-default categories**
  (`<details>` per category), with a single delegated name filter.
- Per thumbnail: name, dimensions, and a copy-paste border snippet
  (`{ left: 34, bottom: 53, right: 34, top: 36 }`).
- Blocking-issue items get a **red outline** and are surfaced in a `position:sticky` "Issues"
  section, so they stay findable while filtering, not only by scrolling past them.

> **Shipped decision (deviates from the original draft, accepted):** thumbnails are rendered up
> front rather than lazily constructed on expand, and images rely on the browser's native
> `loading="lazy"` (so off-screen art isn't fetched). The 9-slice border is shown as a static
> snippet, not a hover/click overlay. For a ~1,400-item dev-only reference page this is plenty
> light and far simpler; lazy DOM construction and an interactive border overlay were deferred as
> unjustified complexity. Revisit only if the page becomes sluggish in practice.

### `manifest.json` — machine-readable index

Top-level envelope: `{ grammarVersion, generatedAt, components: [...] }` (so the grammar-version
bump is recorded alongside the data). Per component: `{ id, category, subtype, name, size, file,
ext, width, height, effectiveAlpha, pngHash, metaHash, guid, border {left,bottom,right,top},
pivot {x,y}, sliceable, issues[], severity }`.
- **`id` = the repo-relative path under `Components/` without extension** — this, not `name`, is
  the unique canonical ID. It resolves the icon-size collision (see *Icon size variants* below).
  `name` is the filename (human label, unique only within its folder); `size` is the variant
  folder (`Original`/`512`/`256`/`128`) for icon sets, `null` otherwise.
- `metaHash` is over a **normalized** parse of **`{spriteBorder, spritePivot, spriteMode,
  textureType}` only** — deliberately **excluding `guid`** (guids are unique per asset; including
  one would make every meta hash unique and defeat dedup). This field list is fixed so the hash is
  reproducible across script versions.
- `sliceable` = `border != {0,0,0,0}`.
- `effectiveAlpha` = has alpha channel **and** it isn't fully opaque (see probe step); `false`
  raises the `no-alpha` advisory.
- **Consumers (named):** the `components` skill / helper CLI (primary), humans reading it
  alongside the pages, and the future phase-2 catalog generator. **The CLI checks
  `grammarVersion`:** if the manifest's version is **newer than the CLI knows**, it refuses and
  tells the user to update the tooling (a newer grammar may carry slots/vocab it can't interpret).

**Icon size variants:** the 4 icon sets repeat the same art under `Original/512/256/128`. Because
`id` is path-based, `Icon_PictoIcons/256/Icon_Picto_Book` and `…/512/Icon_Picto_Book` are distinct
IDs with the same `name`. Skill/CLI lookup by `name` returning multiple sizes **prompts for the
size** (or uses a configured default resolution) — never silently picks.

### `audit-report.md` — fix-it punch-list

Issues grouped by type and severity with counts.

### `rename-map.csv` — review-then-apply mapping

Columns: `old_path, new_name, change_types, reason`. **Only rows where `old != new`** are
included (drastically shrinks the review). `change_types` is **multi-valued** (a `+`-joined,
canonically-ordered set) because one rename usually does several things at once — e.g.
`Button_01_Mian_l_Bg_Blue → Button_Main_01_Large_Background_Blue` is
`typo-fix+abbrev-expand`. **Canonical order is this fixed precedence (not alphabetical):**
`typo-fix`, `abbrev-expand`, `prefix-realign`, `ext-case`, `space-fix`, `variant` — so the
joined string is deterministic and the sort groups consistently. The CSV is sorted by
`change_types` so a reviewer can sanity-check clusters rather than rows. Typo fixes are
**proposals with a `reason`**, never a silent blanket rule. `.Png`→`.png` (`ext-case`) is a
rename and lives here too.

**`# csv-sha256:` header** records the content hash. **What's hashed:** the parsed
`(old_path, new_name)` pairs **sorted by `old_path`** — *not* the raw file bytes, and
**ignoring `change_types` and `reason`** (commentary). This lets a reviewer edit a `reason`,
reorder rows, or add comments without invalidating the hash, while any change to an actual
mapping is caught. `audit` writes the hash over this same canonical form it generates.

## Naming / "same language"

Style: **fully spelled-out (verbose)**. Formal grammar — fixed slot order, optional slots may
be empty:

```
<Category>_<Subtype>[_<Style##>][_<Size>]_<Part>[_<Color>][_<State>][_v<N>]
```

| Slot | Required | Allowed values (extensible) |
|---|---|---|
| Category | yes | `Button` `Frame` `Slider` `Title` `Label` `Popup` `UI` `Icon` |
| Subtype  | yes | PascalCase token, e.g. `Main` `Tab` `Border` `Ribbon` `Flag` `Picto` `Item` `Chest` `Shop` |
| Style##  | no  | zero-padded number from the source `_01_` style index |
| Size     | no  | `Small` `Large` (from `s`/`l`) |
| Part     | when applicable | `Background` `Border` `InnerBorder` `Fill` `FocusGlow` `Line` `Gradient` … |
| Color    | no  | `Blue` `Green` `Red` `Mint` `Navy` `White` … |
| State    | no  | `Focus` `Locked` `Open` `Light` … |
| v\<N\>   | no  | explicit **variant marker** for genuinely distinct duplicates (`_v2`, `_v3`) |

Rules: PascalCase tokens, `_` separators, no spaces; spell out `Bg`→`Background`, `l`→`Large`,
`s`→`Small`; fix typos (`Mian`→`Main`) **as CSV proposals only**.

**Duplicate / `" N"`-suffixed files** (e.g. `…Green 1`): the audit compares the
**(pngHash, metaHash)** tuple (see *Issue model*). Same-png+same-meta → `duplicate` (delete
candidate); same-png+different-meta → `borders-differ` defect; distinct → reviewer assigns an
explicit `_vN`. This removes the `Green_2`-vs-style-`2` ambiguity.
**Near-identical (non-exact) duplicates are explicitly out of scope:** two re-exports differing
by a few compression-artifact pixels won't hash-match and will land in the `_vN` bucket. We
accept this — perceptual hashing is not worth the complexity here; near-dups become `_v2`/`_v3`.

Examples:

| Old | New |
|---|---|
| `Button_01_Mian_l_Bg_Blue` | `Button_Main_01_Large_Background_Blue` |
| `Button_Border_Circle_H53_White_InnerBorder1` | `Button_Border_Circle_H53_White_InnerBorder` |
| `FlagFrame_01_Bg_Green 1` | *(hashed → delete if dup, else `Frame_Flag_01_Background_Green_v2`)* |
| `PictoIcon_Book` | `Icon_Picto_Book` |
| `ItemIcon_Medal_Bronze_1` | `Icon_Item_Medal_Bronze_1` |
| `ToastMessage_02_Line` (UI_Etc) | `UI_Toast_02_Line` |
| `Badge_Value_01_Blue` (UI_Etc) | `UI_Badge_Value_01_Blue` |
| `Switch_01_Bg` (UI_Etc) | `UI_Switch_01_Background` |
| `Grade_Star` (UI_Etc) | `UI_Star_Grade` |

For the 71 `UI_Etc` items, Category = `UI` and Subtype = the thing (`Toast`, `Badge`, `Switch`,
`Star`, `StatusBar`, …).

**Vocabulary source of truth: `Components/_index/grammar.json`.** It holds the closed
vocabularies (Category, Size, Part, Color, State), the per-category required-slots table, and
the `grammarVersion`. The validator reads it, the manifest stamps its version, and
`README.md`'s grammar section is **generated from it** — so the enum can't drift between code and
docs. Adding a value = edit `grammar.json` + bump `grammarVersion` in the same change.

**Grammar invariant (validated at audit start, fails loud if violated):** Subtype tokens must be
**disjoint from every closed-vocabulary value across all later slots**. This is what makes the
"Subtype is the one open token" rule unambiguous: a Subtype can never equal a Color/State/Part/
Size value. So `Button_Focus_…` is invalid (`Focus` is a State, not a usable Subtype) — a
focus-style button family must pick a Subtype token that doesn't collide (e.g. `Highlight`). The
audit asserts the vocabularies are mutually disjoint and that no Subtype in use collides, so a
future `grammar.json` edit that introduces a collision is caught immediately, not silently.

**The grammar is per-category** (8 mini-grammars sharing one shape). `grammar.json` carries a
**required-slots-by-category** lookup the validator consults — e.g. `Part` required for
`Button/Frame/Slider/Popup/Label`, optional for `Icon/Title`. This is the single place that
divergence between doc and implementation is prevented.

**Validation:** tokenize on `_`; `token[0] ∈ Category`; `token[1]` = Subtype (`^[A-Z][A-Za-z0-9]*$`,
disjoint per the invariant); each remaining token matches exactly one later slot in order
(`Style ^\d{2}$`, `Size`, `Part`, `Color`, `State`, `Variant ^v\d+$`), satisfying the category's
required slots. A name is **conformant** iff it fully validates. `Button_Main_Frobnicate_…`
**fails** (`Frobnicate` fits no later slot and isn't in Subtype position).

New colors/states/parts fail conformance **by design** — the fix is a **grammar-version bump**
(add to `grammar.json`), after which the name validates and is a no-op. This prevents CSV churn:
the generator renames **only non-conformant names**; legitimate new vocabulary is handled by
extending the enum, never by renaming a component to itself.

The **canonical component ID = the manifest `id` (repo-relative path under `Components/` without
extension)**, not the bare filename — this keeps IDs unique across the icon size folders. A
hand-authored **`Components/README.md`** documents the taxonomy, usage workflow, and sign-off
process; its grammar section is generated from `grammar.json`.

## 9-slice wiring (border order is already handled)

From `src/shared/nineSlice.ts`:

```ts
export interface UnityBorder { left: number; bottom: number; right: number; top: number; }
export function makeNineSlice(opts: {
  texture: Texture; border: UnityBorder; width: number; height: number;
}): NineSliceSprite
```

It maps Unity `{left,bottom,right,top}` → PIXI `(leftWidth, topHeight, rightWidth, bottomHeight)`
internally. So the meta's `spriteBorder {x,y,z,w}` maps to `border {left:x, bottom:y, right:z,
top:w}` — there is **no CSS-order trap**, because callers pass the named `UnityBorder` object,
not positional args. A round-trip test (below) locks this in.

## Issue model (detection → resolution)

| Severity | Issues | Gates |
|---|---|---|
| **Blocking** | `corrupt`, `zero-byte`, `missing-meta`, unparseable meta | Excluded from "usable" set; **skill refuses to wire them**; must be fixed/removed before they count as available. |
| **Advisory** | `naming`, `extension-case`, `duplicate`, `borders-differ`, `no-alpha` | Surfaced in report/CSV; do **not** block the rename or skill, but should be resolved. |

`duplicate` vs `borders-differ`: dedup compares the **(pngHash, metaHash) tuple**. Same png **and**
same meta = `duplicate` (delete candidate). **Same png, different meta** = `borders-differ` — a
real defect (identical art with mismatched 9-slice/pivot), surfaced as its own advisory rather
than silently treated as a dup.

Resolution path: the report is the owner's punch-list. Blocking issues are fixed at source
(re-export or delete) and re-audited. The rename pass may proceed with advisory issues present;
blocking-issue files simply aren't offered for use until resolved.

## Visual sign-off (concrete, not "eyeball it")

`Components/_index/signoff.md` (committed): one row per category. A reviewer opens `gallery.html`,
spot-checks the **sample** for that category plus **every blocking-issue item**, and signs with
name + date. "Looks good" = no rendering corruption, alpha correct, art on-style.

- **Sample = deterministic, not random:** the N items (default 10) evenly spaced across the
  category's name-sorted list. Reproducible (so a sign-off is meaningful and re-checkable) yet
  spread across the set (not the same first-10 forever).
- **Freshness:** each signed row records the **category's manifest content-hash** at sign-off
  time. `audit` recomputes it; if a category's hash changed (items added/removed/renamed/border
  edited), that row's sign-off is marked **stale** and must be re-signed. The library is
  "verified" only when every category row is signed **and** current. This closes both the
  "growth invalidates nothing" and "stale sample" gaps.

## Skill: `components` (deterministic core + thin LLM layer)

The contradiction "no logic, but does a lot" is resolved by splitting it:

- **`scripts/components-cli.js` (deterministic helper)** does the mechanical work the skill
  invokes: `lookup <name>` (exact match against `manifest.json`; on multiple matches it
  returns the candidate list — it never guesses), `use <exact-name> --into <assets-subdir>`
  (copies the PNG, returns the border/pivot JSON). Same inputs → same outputs, every time.
- **Skill markdown (thin LLM layer)** handles only: parse the user's intent → if the CLI
  returns multiple candidates, **prompt for explicit disambiguation** (no silent fuzzy pick)
  → place code per the convention below → write the `makeNineSlice`/`Sprite` wiring using the
  border the CLI returned.
- **Code-placement convention** (so two devs get the same result, not just the same asset):
  the **import** binds the full canonical-ID-camelCased name (stable, greppable); at the
  **usage site** a short local alias by convention (`bg`, `border`, `innerBorder`, `focusGlow`
  for the part — or a caller-chosen name for the whole widget) keeps real code readable. This
  acknowledges that 30+ char names like `buttonMain01LargeBackgroundBlue` everywhere won't
  survive code review; the canonical name lives on the import line, the short alias at use. The
  sprite is added to the scene's designated `ui` container; if scene/container is ambiguous the
  skill **asks**. (The exact alias pattern is documented in `README.md`.)
- **Refuses** to wire a component with a **blocking** issue, and **cites the specific issue**
  (e.g. "`missing-meta`, so no border data"). **For multi-part assemblies, a blocking issue on
  *any* part blocks the whole assembly** (you can't ship a half-button) — the skill names the
  offending part so the user knows exactly what to fix.
- Can trigger `npm run audit:components` to refresh the index on request.
- **Scope:** UI components only. Backgrounds/boards/characters (Spine) are out of scope.

## Adding new assets later (re-run model)

Drop files (PNG + `.meta`) into the right category folder, re-run `npm run audit:components`:
names page, gallery, manifest, report, and counts-diff all update; the rename map proposes
names only for **non-conformant** new files (conformant ones are left alone). Deletes/renames
reflect the same way.

## Testing

- **Real corpus:** PNG count matches `expected-counts.json`; manifest is valid JSON; both pages
  render and filter; border overlay aligns on a known 9-slice button.
- **9-slice round-trip:** one committed test that takes a known meta's `spriteBorder`, builds a
  `makeNineSlice`, and asserts the PIXI sprite's edges equal the Unity values (guards #14).
- **Detectors:** temp fixture with a meta-less PNG and a 0-byte file → `missing-meta` /
  `zero-byte` fire.
- **Conformance validator:** unit cases — a fully-formed name validates; `…_Frobnicate_…`
  fails; a name using a not-yet-enumerated color fails until the vocabulary is bumped, then
  passes (proves the grammar-version-bump path and no-churn).
- **Rename safety (on a temp copy):** PNG+meta move as pairs; case-insensitive collision guard
  blocks `Foo` vs `foo`; `--confirm-count` mismatch aborts; **CSV-hash mismatch aborts** (edit a
  `new_name`, keep the count, confirm it's rejected); a simulated mid-run kill leaves a state the
  next `audit` flags and the next apply **resumes from the journal**; an edited-CSV-after-crash
  aborts on journal hash mismatch; pre-flight reference-scan abort works.
- **Reference-scan self-test:** plant a `Components/`-referencing file and assert the scan
  catches it (guards the gate against silently no-op-ing — the original brace-glob bug).
- **External check:** diff against committed `expected-counts.json`, not only the script's own
  tally.

## Decisions (made now, not punted)

- **Git:** commit `grammar.json` (vocabulary source of truth), `manifest.json`,
  `audit-report.md`, `expected-counts.json`, `Components/README.md`, `signoff.md`, and **both
  HTML pages** (so teammates open them from a clone without running the script — documented as
  local-open-only). `rename-map.csv` is committed once applied, as a historical record.
  **Gitignored** (transient): `proposed-counts.json` and `rename-journal.jsonl`/`*.done`.
- **YAML:** add `js-yaml` (correctness over zero-deps).
- **Gallery scale:** collapsed-category lazy DOM + event delegation (not full virtualization).
- **Pages:** local-only; not a hosted/GitHub-rendered artifact.

## Out of scope (YAGNI)

- Auto-applying renames without the reviewed CSV + `--confirm-count`.
- Hosting the gallery (GitHub Pages / web).
- **Phase 2:** typed `catalog/*.ts` generation from the manifest (real next step, not dismissed —
  the manifest schema is kept catalog-ready).
- WebP conversion (the existing build does this when assets move into `assets/`).

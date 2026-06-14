# Unity asset handoff

Drop sprite PNGs from the Unity project into this folder, **along with their `.meta` files**. The `.meta` is what carries the 9-slice borders (`spriteBorder: {x, y, z, w}` = left, bottom, right, top in pixels).

## Expected file names

For the dice-blackjack playable we currently consume these:

| File pair | Used for | Notes |
|---|---|---|
| `claim.png` + `claim.png.meta` | CLAIM button background | 9-sliced |
| `double.png` + `double.png.meta` | DOUBLE button background | 9-sliced |
| `coin.png` *(no `.meta` needed)* | Coin icon used everywhere (badge, button sub-labels, win splash) | Fixed-aspect, not 9-sliced |

If your Unity exports have different names, rename them to match — the extractor matches by filename.

## After dropping

Run from the repo root:

```
npm run extract:dice-blackjack-9slice
```

The extractor will:
1. Parse each `.meta` for `spriteBorder`
2. Copy `claim.png` and `double.png` into `assets/dice-blackjack/buttons/`
3. Copy `coin.png` (if present) into `assets/UI/Coin.png` (replacing the placeholder)
4. Regenerate `src/playables/dice-blackjack/buttons9slice.ts` with the borders + asset imports

You should never need to hand-edit `buttons9slice.ts` — re-run the extractor whenever Unity exports change.

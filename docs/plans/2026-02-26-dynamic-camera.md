# Dynamic Camera & Auto-Walk Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the static full-board view with a zoomed-in camera that follows the player, plus auto-walk movement to demo it.

**Architecture:** The board stays as a large Sprite. Camera = board position offset so the player tile is centered on screen, with look-ahead toward the next tile and pull toward board center (porting Unity's TileOffsetFromPlayer). Player auto-advances one tile every ~2s with a lerped hop. All tweening done manually via lerp in the ticker (no external tween lib).

**Tech Stack:** PixiJS 8, Spine, TypeScript, playable-scripts webpack

---

### Task 1: Add `boardCenter` to BoardConfig and board1

**Files:**
- Modify: `src/boards/BoardConfig.ts`
- Modify: `src/boards/board1.ts`

**Step 1: Add `boardCenter` to the interface**

In `src/boards/BoardConfig.ts`, add after the `focalPoint` property:

```typescript
/** Center of the board diamond in source-image coords, used for camera pull-toward-center */
boardCenter: TileCoord;
```

**Step 2: Add `boardCenter` value to board1Config**

In `src/boards/board1.ts`, add to the config object after the `focalPoint` line:

```typescript
boardCenter: { x: 1550, y: 1600 },
```

**Step 3: Update `boardScale` to 0.85**

In `src/boards/board1.ts`, change `boardScale: 0.3` to:

```typescript
boardScale: 0.85,
```

**Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

---

### Task 2: Add camera state properties to Game.ts

**Files:**
- Modify: `src/Game.ts`

**Step 1: Add new properties after existing ones (after line 27)**

```typescript
// Camera system — source-image coordinates
private cameraTarget = { x: 0, y: 0 };
private cameraPos = { x: 0, y: 0 };

// Movement
private currentTileIndex = 0;
private isMoving = false;
private moveProgress = 0; // 0→1 during a hop
private moveFrom = { x: 0, y: 0 }; // source coords
private moveTo = { x: 0, y: 0 };   // source coords
private idleTimer = 0;
```

**Step 2: Add camera/movement constants after existing constants (after line 15)**

```typescript
const CAMERA_LERP = 0.08;           // per-frame lerp factor (~60fps)
const LOOK_AHEAD_TILES = 1;         // how many tiles ahead the camera looks
const CENTER_PULL = 80;             // px in source coords — pull toward board center
const CAMERA_MAX_OFFSET = { x: 200, y: 160 }; // max offset from player in source coords
const HOP_DURATION = 0.3;           // seconds per tile hop
const IDLE_BETWEEN_HOPS = 2.0;      // seconds idle before next auto-walk
```

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit`

---

### Task 3: Replace positionBoard with camera-based positioning

**Files:**
- Modify: `src/Game.ts`

**Step 1: Replace `positionBoard()` (lines 129-134)**

Replace the entire method with:

```typescript
/** Positions the board so that cameraPos (source coords) is centered on screen. */
private positionBoard(): void {
  this.boardSprite.position.set(
    this.width  / 2 - this.cameraPos.x * this.config.boardScale,
    this.height / 2 - this.cameraPos.y * this.config.boardScale,
  );
}
```

**Step 2: Add `updateCameraTarget()` method** (after positionBoard)

Port of Unity's TileOffsetFromPlayer.cs:

```typescript
/**
 * Computes the camera target: look-ahead toward next tile + pull toward board center.
 * Ported from Unity's TileOffsetFromPlayer.cs.
 */
private updateCameraTarget(): void {
  const tiles = this.config.tiles;
  const cur = tiles[this.currentTileIndex];
  const nextIdx = (this.currentTileIndex + LOOK_AHEAD_TILES) % tiles.length;
  const next = tiles[nextIdx];

  // Interpolate between current and next tile (look-ahead)
  const t = LOOK_AHEAD_TILES / Math.ceil(LOOK_AHEAD_TILES);
  let tx = cur.x + (next.x - cur.x) * t;
  let ty = cur.y + (next.y - cur.y) * t;

  // Pull toward board center
  const center = this.config.boardCenter;
  const dx = center.x - tx;
  const dy = center.y - ty;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  tx += (dx / dist) * CENTER_PULL;
  ty += (dy / dist) * CENTER_PULL;

  // Clamp max offset from player
  const clampX = tx - cur.x;
  const clampY = ty - cur.y;
  if (Math.abs(clampX) > CAMERA_MAX_OFFSET.x) {
    tx = cur.x + Math.sign(clampX) * CAMERA_MAX_OFFSET.x;
  }
  if (Math.abs(clampY) > CAMERA_MAX_OFFSET.y) {
    ty = cur.y + Math.sign(clampY) * CAMERA_MAX_OFFSET.y;
  }

  this.cameraTarget.x = tx;
  this.cameraTarget.y = ty;
}
```

**Step 3: Initialize camera in `init()`**

After `this.positionHero();` (line 110), add:

```typescript
// Initialize camera on player's starting tile
this.updateCameraTarget();
this.cameraPos.x = this.cameraTarget.x;
this.cameraPos.y = this.cameraTarget.y;
this.positionBoard();
```

**Step 4: Verify it compiles and the view is zoomed in on the player**

Run: `npx tsc --noEmit`
Then check browser at localhost:3000 — should see a zoomed-in view centered near tile 0.

---

### Task 4: Add camera lerp to the ticker

**Files:**
- Modify: `src/Game.ts`

**Step 1: Add camera update to the ticker**

In the existing `this.ticker.add((t) => { ... })` block (lines 98-108), add at the END of the callback (before the closing `});`):

```typescript
// Camera smooth follow
this.cameraPos.x += (this.cameraTarget.x - this.cameraPos.x) * CAMERA_LERP;
this.cameraPos.y += (this.cameraTarget.y - this.cameraPos.y) * CAMERA_LERP;
this.positionBoard();
```

**Step 2: Update `resize()` to use camera system**

Replace the resize method (lines 174-180) with:

```typescript
resize(width: number, height: number) {
  this.width = width;
  this.height = height;
  this.app.renderer.resize(width, height);
  if (this.boardSprite) this.positionBoard();
}
```

Note: hero positioning is now handled by the movement system / ticker, not resize. The hero is a child relationship via screen coords that depend on boardSprite position, so `positionBoard()` is sufficient.

**Step 3: Verify camera is smooth**

Check browser — the view should be zoomed in on the hero near tile 0. Resizing the window should re-center smoothly.

---

### Task 5: Implement tile-to-tile movement

**Files:**
- Modify: `src/Game.ts`

**Step 1: Add `startHop()` method**

```typescript
/** Begin a hop from the current tile to the next tile. */
private startHop(): void {
  const tiles = this.config.tiles;
  const fromTile = tiles[this.currentTileIndex];
  this.moveFrom.x = fromTile.x;
  this.moveFrom.y = fromTile.y;

  this.currentTileIndex = (this.currentTileIndex + 1) % tiles.length;
  const toTile = tiles[this.currentTileIndex];
  this.moveTo.x = toTile.x;
  this.moveTo.y = toTile.y;

  this.moveProgress = 0;
  this.isMoving = true;

  // Play walk/run animation if available, otherwise keep idle
  this.hero.state.setAnimation(0, 'Run', true);
}
```

**Step 2: Add movement update in the ticker**

Add this block in the ticker callback, BEFORE the camera update code:

```typescript
// Auto-walk: idle timer → hop → repeat
if (this.isMoving) {
  this.moveProgress += (t.deltaMS / 1000) / HOP_DURATION;
  if (this.moveProgress >= 1) {
    this.moveProgress = 1;
    this.isMoving = false;
    this.idleTimer = 0;
    // Return to idle animation
    this.hero.state.setAnimation(0, 'Idle', true);
  }

  // Lerp hero position (source coords → screen coords)
  const eased = this.moveProgress; // linear for now
  const sx = this.moveFrom.x + (this.moveTo.x - this.moveFrom.x) * eased;
  const sy = this.moveFrom.y + (this.moveTo.y - this.moveFrom.y) * eased;

  // Add a jump arc: parabolic Y offset (peak at progress=0.5)
  const jumpHeight = 30; // pixels in source coords
  const jumpArc = -4 * jumpHeight * (eased - 0.5) * (eased - 0.5) + jumpHeight;

  const screenPos = this.tileToScreen({ x: sx, y: sy - jumpArc });
  this.hero.x = screenPos.x;
  this.hero.y = screenPos.y;

  // Update camera target to follow
  this.updateCameraTarget();
} else {
  this.idleTimer += t.deltaMS / 1000;
  if (this.idleTimer >= IDLE_BETWEEN_HOPS) {
    this.startHop();
  }
}
```

**Step 3: Remove the old idle→attack cycle**

The existing ticker callback (lines 98-108) has the idle→attack timer. Remove or disable this for now — the auto-walk replaces it. Remove the `isIdle` and `idleElapsed` properties too.

The ticker callback should now ONLY contain:
1. Movement update (hop or idle timer)
2. Camera lerp + positionBoard

**Step 4: Update `positionHero()` to set initial position and scale only**

Replace `positionHero()` with:

```typescript
private positionHero() {
  const tile = this.config.tiles[this.currentTileIndex];
  const pos = this.tileToScreen(tile);
  this.hero.x = pos.x;
  this.hero.y = pos.y;
  // Scale character relative to tile size
  const tileSize = 130 * this.config.boardScale;
  const scale = (tileSize * 1.8) / 600;
  this.hero.scale.set(scale);
}
```

**Step 5: Verify movement works**

Check browser — hero should idle for 2s, then hop to the next tile with a jump arc, camera follows smoothly, loops around the diamond.

---

### Task 6: Polish and verify both orientations

**Files:**
- Modify: `src/Game.ts` (tuning only)

**Step 1: Test portrait mode**

Use Playwright or browser dev tools to set viewport to 390×844 (iPhone portrait). Verify:
- Hero is visible and centered
- Board is zoomed in showing ~3-4 tiles around player
- Camera follows during movement

**Step 2: Test landscape mode**

Set viewport to 844×390. Verify:
- Same zoom level (more board visible horizontally)
- Camera still follows correctly

**Step 3: Tune constants if needed**

Adjust these values visually:
- `boardScale` — increase/decrease to match the reference screenshot zoom level
- `CENTER_PULL` — more/less pull toward the statue
- `CAMERA_MAX_OFFSET` — how far camera can lead the player
- `HOP_DURATION` — faster/slower hops
- `IDLE_BETWEEN_HOPS` — more/less waiting between moves

**Step 4: Verify resize works**

Resize the browser window while the hero is moving. Camera should adapt smoothly.

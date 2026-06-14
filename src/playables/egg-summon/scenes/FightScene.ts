import { Assets, Container, Graphics, Sprite, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import { tween } from '@shared/tween';
import { easeOutBack } from '@shared/easing';
import { loadEggArt } from '../catalog';
import * as audio from '../audio';
import { FightEngine } from '../../board-fight/fight/FightEngine';
import type { PlayerState } from '../../board-fight/PlayerState';
import { WARRIORS_BLADE } from '../../board-fight/catalog/weapons/warriorBlade';
import type { FightSceneConfig } from '../../board-fight/fight/FightStep';
import boardBgData from 'assets/Backgrounds/Board1Asset.webp';
import { RARITY_COLORS } from '../../board-fight/skills';
import type { SkillConfig } from '../../board-fight/skills';
import { SHURIKEN_FLURRY } from '../../board-fight/catalog/skills/shurikenFlurry';
import { CHAIN_LIGHTNING } from '../../board-fight/catalog/skills/chainLightning';
import { FUMA_SHURIKEN } from '../../board-fight/catalog/skills/fumaShuriken';
import { THUNDERSTORM } from '../../board-fight/catalog/skills/thunderstorm';
import { FROST_BREATH } from '../iceSkillVfx';

// Like the real game: the battle plays in a panel over the TOP ~55% of the
// screen, and the BOARD shows (dimmed) beneath it with the player's SKILL bar —
// NOT a black void.
const DIM_ALPHA = 0.58;
const BATTLE_AREA_RATIO = 0.55;
const BATTLE_SKEW = 0.025;
const REF_SHORT_SIDE = 390;
function viewportScale(w: number, h: number): number {
  const s = Math.min(w, h);
  return s >= REF_SHORT_SIDE ? 1 : s / REF_SHORT_SIDE;
}

// The hero's acquired-skill deck (what shows in the bar). Built from the real
// game skill catalog so the bar reads like an actual run: the dragon's mythic
// ice plus the hero's shuriken + lightning skills (mixed rarities → mixed
// frame colours, exactly like board-fight's fight scene).
const ALL_SKILLS: SkillConfig[] = [
  FROST_BREATH, FUMA_SHURIKEN, SHURIKEN_FLURRY, CHAIN_LIGHTNING, THUNDERSTORM,
];
const HERO_DECK = ALL_SKILLS.map((s) => s.id);

// Skill-bar look — identical to board-fight's FightScene.
const SKILL_ICON_SIZE = 72;
const SKILL_ICON_GAP = 10;
const SKILL_ICON_RADIUS = 12;
const SKILL_ICON_BORDER = 3.5;
const SKILL_GRID_COLS = 5;
const PULSE_SCALE = 1.2;
const PULSE_MS = 150;
const FLASH_MS = 220;     // additive white "skill used" flash decay

// A skill is CAST in the fight under one id but shown in the bar under its
// catalog id — map cast → bar icon so the right slot pulses/charges.
const CAST_TO_BAR: Record<string, string> = {
  glacialStrike: 'frostBreath',
  frostBreath: 'frostBreath',
  shurikenThrow: 'shurikenFlurry',
  chainLightning: 'chainLightning',
};

export class FightScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;
  private resolveDone!: () => void;
  private ready = false;
  private runStarted = false;
  private boardBackdrop!: Sprite;   // the board, shown dimmed beneath the battle
  private dimOverlay!: Graphics;
  private bottomFade!: Graphics;    // extra darkening that ramps in behind the skill bar
  private battleArea!: Container;
  private battleMask!: Graphics;
  private bgSprite!: Sprite;
  private engine!: FightEngine;
  private skillBar!: Container;
  private skillIcons: Container[] = [];
  private skillIdToIcon: Map<string, Container> = new Map();
  private skillFlashes: Map<string, Graphics> = new Map();
  private fillX = 0; private fillW = 0; private fillY = 0; private fillH = 0;

  constructor(
    private config: FightSceneConfig,
    private ticker: Ticker,
    private width: number,
    private height: number,
  ) {
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    const config = this.config;
    const [bgTexture, boardTexture] = await Promise.all([
      Assets.load(config.background),
      Assets.load(boardBgData),
    ]);

    // Board backdrop (bottom layer) — the real board, shown dimmed beneath the
    // battle so the lower portion of the screen reads as the game board. Covers
    // the FULL viewport (immersive — the forest/board fill the whole screen on
    // iPad/landscape, and the fighters spread across the full width).
    this.boardBackdrop = new Sprite(boardTexture);
    this.boardBackdrop.anchor.set(0.5, 0.5);
    this.container.addChild(this.boardBackdrop);

    this.dimOverlay = new Graphics();
    this.container.addChild(this.dimOverlay);

    // Extra darkening that fades in toward the bottom: the board's statue/path
    // stay faintly visible just under the battle, but the area behind the skill
    // bar reads near-black (like the real game / board-fight) — NOT bright green.
    this.bottomFade = new Graphics();
    this.container.addChild(this.bottomFade);

    // Skill bar over the dimmed board (built before the battle panel so the
    // panel/fighters always render on top of it).
    this.skillBar = new Container();
    this.skillBar.visible = false;
    this.container.addChild(this.skillBar);
    await this.buildSkillBar();

    this.battleArea = new Container();
    this.container.addChild(this.battleArea);
    this.battleMask = new Graphics();
    this.container.addChild(this.battleMask);
    this.battleArea.mask = this.battleMask;

    this.bgSprite = new Sprite(bgTexture);
    this.bgSprite.anchor.set(0.5, 0.5);
    this.battleArea.addChild(this.bgSprite);

    const state: PlayerState = {
      hp: 200000, maxHp: 200000, atk: 50000, coins: 0,
      skills: HERO_DECK,
      weapon: 'warriorBlade', weaponConfig: WARRIORS_BLADE,
      heroSkin: 'Base', boardTileIndex: 0,
    };
    const battleH = this.height * BATTLE_AREA_RATIO;
    this.engine = new FightEngine(config, state, this.ticker, this.battleArea, this.width, battleH);
    // On victory, keep the whole battle scene up (don't fade it out). The default
    // fade drops the battle area to alpha 0 and reveals the dimmed board behind it
    // for a beat before claim, which reads as a hiccup. Instead the scene-manager
    // crossfade dissolves the full victory scene straight into the claim scene.
    this.engine.keepSceneOnVictory = true;
    // Drive the bar from the real fight: pulse + a brief additive white flash on
    // the matching slot the instant its skill is cast.
    this.engine.onSkillActivated = (id) => this.flashSkillIcon(CAST_TO_BAR[id] ?? id);
    await this.engine.init();

    this.ready = true;
    this.skillBar.visible = true;
    // NOTE: engine.run() is started from the first layout() (see below), not here.
    // The VS intro positions the fighters synchronously at the start of run(), and
    // it must use the REAL viewport fill width (so they spread across the full
    // screen on iPad/landscape). The SceneManager applies the real layout right
    // after enter() returns, so deferring run() to that first layout avoids using
    // a stale (design-column) width for the intro.
  }

  /** Start the fight once, on the first layout that carries the real fill width. */
  private startRun(): void {
    if (this.runStarted) return;
    this.runStarted = true;
    this.engine.run()
      .then(() => this.config.victoryReward ? this.playVictoryReward() : undefined)
      .then(() => this.resolveDone())
      .catch((err) => { console.error('[FightScene] run() failed', err); this.resolveDone(); });
  }

  /** Loot from the win: a reward egg pops up in the battle panel with a glow +
   *  sparkle burst + "EGG REWARD!" caption, held a beat before the scene resolves
   *  (carries into the egg-crack reward scene). Gated by config.victoryReward. */
  private async playVictoryReward(): Promise<void> {
    const art = await loadEggArt();
    const cx = this.fillX + this.fillW / 2;
    const cy = this.height * 0.30;                              // centre of the battle panel
    const panelMin = Math.min(this.fillW, this.height * BATTLE_AREA_RATIO);

    const glow = new Sprite(art.glow);
    glow.anchor.set(0.5); glow.tint = 0xffe066; glow.blendMode = 'add';
    glow.position.set(cx, cy); glow.alpha = 0;
    glow.width = glow.height = panelMin * 0.8;
    this.container.addChild(glow);

    const egg = new Sprite(art.closed);
    egg.anchor.set(0.5);
    egg.position.set(cx, cy);
    const eggH = panelMin * 0.34;
    egg.height = eggH; egg.scale.x = egg.scale.y;
    const eggBase = egg.scale.y;
    egg.scale.set(0);
    this.container.addChild(egg);

    // Egg pops up out of the battle with an overshoot + glow swell. A bright
    // reveal sting lands on the pop, then a reward ding on the sparkle burst —
    // layered so getting the egg feels satisfying.
    audio.summonReveal(1);
    await tween(this.ticker, 440, (t) => {
      egg.scale.set(eggBase * easeOutBack(t));
      glow.alpha = Math.min(0.85, t);
    });
    this.spawnRewardSparkles(cx, cy, eggH);
    audio.rewardReceived(1);
    // Brief hold so the egg registers, then move on to the crack scene quickly.
    await tween(this.ticker, 650, () => {});
  }

  private spawnRewardSparkles(cx: number, cy: number, R: number): void {
    for (let i = 0; i < 10; i++) {
      const s = new Graphics().star(0, 0, 5, R * 0.09, R * 0.04).fill(0xfff3b0);
      const a = (i / 10) * Math.PI * 2;
      s.position.set(cx, cy);
      this.container.addChild(s);
      const d = R * (0.7 + Math.random() * 0.5);
      void tween(this.ticker, 560, (t) => {
        if (s.destroyed) return;
        s.x = cx + Math.cos(a) * d * t;
        s.y = cy + Math.sin(a) * d * t - R * 0.4 * t;
        s.alpha = 1 - t;
        s.rotation = t * 2;
      }).then(() => { if (!s.destroyed) s.destroy(); });
    }
  }

  // ── Skill Bar (verbatim from board-fight's FightScene) ────────────────────

  private async buildSkillBar(): Promise<void> {
    const acquiredSkills = HERO_DECK
      .map((id) => ALL_SKILLS.find((s) => s.id === id))
      .filter((s): s is NonNullable<typeof s> => s != null);

    for (const skill of acquiredSkills) {
      const iconContainer = new Container();

      // Shadow
      const shadow = new Graphics();
      shadow.roundRect(2, 2, SKILL_ICON_SIZE, SKILL_ICON_SIZE, SKILL_ICON_RADIUS)
        .fill({ color: 0x000000, alpha: 0.3 });
      iconContainer.addChild(shadow);

      // Background square — rarity-colored fill & outline
      const colors = RARITY_COLORS[skill.rarity];
      const bg = new Graphics();
      bg.roundRect(0, 0, SKILL_ICON_SIZE, SKILL_ICON_SIZE, SKILL_ICON_RADIUS)
        .fill({ color: colors.skillBg })
        .stroke({ color: colors.skillBorder, width: SKILL_ICON_BORDER });
      iconContainer.addChild(bg);

      // Icon sprite
      if (skill.icon) {
        const tex = await Assets.load(skill.icon);
        const padding = 4;
        const iconScale = (SKILL_ICON_SIZE - padding * 2) / Math.max(tex.width, tex.height);
        const sprite = new Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.scale.set(iconScale);
        sprite.position.set(SKILL_ICON_SIZE / 2, SKILL_ICON_SIZE / 2);
        iconContainer.addChild(sprite);
      }

      // "Skill used" flash: an additive white rounded-rect the exact size of the
      // slot, alpha 0 at rest. No mask (a masked overlay produced a green-channel
      // render artifact on cast), so it can never punch a hole or tint green.
      const flash = new Graphics()
        .roundRect(0, 0, SKILL_ICON_SIZE, SKILL_ICON_SIZE, SKILL_ICON_RADIUS)
        .fill({ color: 0xffffff });
      flash.blendMode = 'add';
      flash.alpha = 0;
      iconContainer.addChild(flash);
      this.skillFlashes.set(skill.id, flash);

      // Set pivot to center for scale animation
      iconContainer.pivot.set(SKILL_ICON_SIZE / 2, SKILL_ICON_SIZE / 2);

      this.skillIcons.push(iconContainer);
      this.skillIdToIcon.set(skill.id, iconContainer);
      this.skillBar.addChild(iconContainer);
    }
  }

  private layoutSkillBar(): void {
    if (this.skillIcons.length === 0) return;

    // A full 5-icon row is 400 design-units wide — wider than the reference
    // short-side (390), so on narrower phones the end icons clip at the screen
    // edges. Cap the bar's scale so the widest row always fits inside the screen
    // with a side margin (keeps it off the corners, a touch toward centre).
    const vScale = viewportScale(this.width, this.height);
    const fullRowW = SKILL_GRID_COLS * SKILL_ICON_SIZE + (SKILL_GRID_COLS - 1) * SKILL_ICON_GAP;
    const scale = Math.min(vScale, (this.width * 0.9) / fullRowW);
    this.skillBar.scale.set(scale);

    const battleH = this.height * BATTLE_AREA_RATIO;
    const totalRows = Math.ceil(this.skillIcons.length / SKILL_GRID_COLS);
    const gridH = totalRows * SKILL_ICON_SIZE + (totalRows - 1) * SKILL_ICON_GAP;
    // Center skill grid vertically in remaining space below battle area
    const remainingH = (this.height - battleH) / scale;
    const gridTop = battleH / scale + (remainingH - gridH) / 2 + SKILL_ICON_SIZE / 2;

    for (let i = 0; i < this.skillIcons.length; i++) {
      const row = Math.floor(i / SKILL_GRID_COLS);
      const col = i % SKILL_GRID_COLS;
      const rowCount = row < totalRows - 1
        ? SKILL_GRID_COLS
        : this.skillIcons.length - row * SKILL_GRID_COLS;
      const rowW = rowCount * SKILL_ICON_SIZE + (rowCount - 1) * SKILL_ICON_GAP;
      const rowLeft = (this.width / scale - rowW) / 2;
      this.skillIcons[i].position.set(
        rowLeft + col * (SKILL_ICON_SIZE + SKILL_ICON_GAP) + SKILL_ICON_SIZE / 2,
        gridTop + row * (SKILL_ICON_SIZE + SKILL_ICON_GAP),
      );
    }
  }

  private pulseSkillIcon(skillId: string): void {
    const icon = this.skillIdToIcon.get(skillId);
    if (!icon) return;
    let elapsed = 0;
    const handler = (ticker: Ticker) => {
      elapsed += ticker.deltaMS;
      const t = Math.min(1, elapsed / PULSE_MS);
      const pulse = t < 0.5
        ? 1 + (PULSE_SCALE - 1) * (t * 2)
        : 1 + (PULSE_SCALE - 1) * (1 - (t - 0.5) * 2);
      icon.scale.set(pulse);
      if (t >= 1) {
        icon.scale.set(1);
        this.ticker.remove(handler);
      }
    };
    this.ticker.add(handler);
  }

  /** Skill cast: pulse the slot + a brief additive white flash that decays to 0
   *  (no mask, so no hole / green artifact). */
  private flashSkillIcon(skillId: string): void {
    this.pulseSkillIcon(skillId);
    const flash = this.skillFlashes.get(skillId);
    if (!flash) return;
    flash.alpha = 0.55;
    let elapsed = 0;
    const handler = (ticker: Ticker) => {
      elapsed += ticker.deltaMS;
      flash.alpha = Math.max(0, 0.55 * (1 - elapsed / FLASH_MS));
      if (elapsed >= FLASH_MS) { flash.alpha = 0; this.ticker.remove(handler); }
    };
    this.ticker.add(handler);
  }

  async exit(): Promise<void> {
    this.engine?.destroyActors();
  }

  update(_deltaMS: number): void {
    // Skill-bar animation is driven by engine events (pulse/charge), matching
    // board-fight — no per-frame work needed here.
  }

  pause(): void { this.container.interactiveChildren = false; }
  resume(): void { this.container.interactiveChildren = true; }

  layout(width: number, height: number, fillX = 0, fillW = width, fillY = 0, fillH = height): void {
    this.fillX = fillX; this.fillW = fillW; this.fillY = fillY; this.fillH = fillH;
    this.width = width; this.height = height;
    if (!this.ready) return;
    const battleH = height * BATTLE_AREA_RATIO;
    const skew = height * BATTLE_SKEW;
    const maskTop = Math.min(0, fillY);

    // The fighters spread across the FULL visible width (immersive: forest fills
    // the whole screen on iPad/landscape, fighters spaced edge-to-edge instead of
    // clustered in a centre column). Also pass the fighting-box vertical extent
    // (maskTop..battleH+skew) so the danger vignette fills the box exactly.
    this.engine.setLayoutBounds(fillX, fillW, maskTop, battleH + skew);

    // Board backdrop: cover the FULL viewport (including margins), biased downward
    // so the board's path/props fill the lower portion.
    const bd = this.boardBackdrop;
    const cover = Math.max(fillW / bd.texture.width, fillH / bd.texture.height) * 1.15;
    bd.scale.set(cover);
    bd.position.set(fillX + fillW / 2, fillY + fillH / 2);

    this.dimOverlay.clear().rect(fillX, fillY, fillW, fillH).fill({ color: 0x000000, alpha: DIM_ALPHA });
    // Ramp darkness from the battle-panel edge down to near-black, covering the
    // FULL bottom region (down to the real viewport bottom, fillBottom) so the
    // skill slots sit on solid dark and there's no hard line on tall phones.
    // Smoothstep to fully opaque well above the skill-bar row.
    this.bottomFade.clear();
    const fillBottom = fillY + fillH;
    const fadeSpan = fillBottom - battleH;
    const N = 48;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const tt = Math.min(1, t / 0.34);
      const a = tt * tt * (3 - 2 * tt);              // smoothstep → fully opaque by ~34% down
      const y0 = battleH + fadeSpan * (i / N);
      const bandH = fadeSpan / N + 1.5;              // slight overlap → no visible banding
      this.bottomFade.rect(fillX, y0, fillW, bandH).fill({ color: 0x0a0a16, alpha: a });
    }
    this.layoutSkillBar();
    // Battle panel: top edge at maskTop (the real top of the viewport) so the
    // forest fills the top margin on tall phones (no black band) rather than
    // stopping at the design top (y=0).
    this.battleMask.clear().poly([fillX, maskTop, fillX + fillW, maskTop, fillX + fillW, battleH - skew, fillX, battleH + skew]).fill({ color: 0xffffff });
    const vScale = viewportScale(width, height);
    this.battleArea.scale.set(vScale);
    this.battleArea.pivot.set(width / 2, battleH / 2);
    this.battleArea.position.set(width / 2, battleH / 2);
    const texW = this.bgSprite.texture.width;
    const texH = this.bgSprite.texture.height;
    // Forest covers the panel region from maskTop down to battleH (extends up into
    // the top margin on tall phones), centred on that region.
    const panelH = battleH - maskTop;
    const bgCover = Math.max(fillW / (texW * vScale), panelH / (texH * vScale));
    this.bgSprite.scale.set(bgCover);
    // Centre the sprite at the fill-rect centre in screen space; convert back to
    // battleArea local coords (account for pivot and scale).
    const bgLocalX = width / 2 + (fillX + fillW / 2 - width / 2) / vScale;
    this.bgSprite.position.set(bgLocalX, (maskTop + battleH) / 2);
    this.engine.layoutActors();

    // Start the fight on the first layout that carries the real fill width (so the
    // VS intro spreads the fighters across the actual screen, not a stale width).
    this.startRun();
  }
}

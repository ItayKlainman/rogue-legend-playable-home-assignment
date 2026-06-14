import { Assets, Container, Graphics, Sprite, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import type { PlayerState } from '../PlayerState';
import type { FightSceneConfig, FightStepLevelUp, FightStepWeaponReward } from '../fight/FightStep';
import { FightEngine } from '../fight/FightEngine';
import { RARITY_COLORS } from '../skills';
import type { SkillConfig } from '../skills';
import { LevelUpScene } from './LevelUpScene';
import type { LevelUpSceneConfig } from './LevelUpScene';
import { WeaponRewardScene } from './WeaponRewardScene';
import { computeLevelUpSkills } from '../dynamicSkillSelection';


const DIM_ALPHA = 0.85;
const BATTLE_AREA_RATIO = 0.55;
const BATTLE_SKEW = 0.025;

// Reference short-side resolution; below this we scale down the battle area
const REF_SHORT_SIDE = 390;
function viewportScale(w: number, h: number): number {
  const shortSide = Math.min(w, h);
  return shortSide >= REF_SHORT_SIDE ? 1 : shortSide / REF_SHORT_SIDE;
}

const SKILL_ICON_SIZE = 72;
const SKILL_ICON_GAP = 10;
const SKILL_ICON_RADIUS = 12;
const SKILL_ICON_BORDER = 3.5;
const SKILL_GRID_COLS = 5;
const PULSE_SCALE = 1.2;
const PULSE_MS = 150;
const CHARGE_MS = 150;
const CHARGE_COLOR = 0xffffff;
const CHARGE_ALPHA = 0.35;

export class FightScene implements Scene {
  readonly container: Container;
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private config: FightSceneConfig;
  private state: PlayerState;
  private ticker: Ticker;
  private width: number;
  private height: number;
  private ready = false;

  private dimOverlay!: Graphics;
  private battleArea!: Container;
  private battleMask!: Graphics;
  private bgSprite!: Sprite;
  private engine!: FightEngine;
  private skillBar!: Container;
  private skillIcons: Container[] = [];
  private skillIdToIcon: Map<string, Container> = new Map();
  private skillChargeOverlays: Map<string, Graphics> = new Map();
  private activeOverlay: Scene | null = null;
  private overlayDim: Graphics | null = null;
  private midFightLevelUpCount = 0;

  constructor(
    config: FightSceneConfig,
    state: PlayerState,
    ticker: Ticker,
    width: number,
    height: number,
  ) {
    this.container = new Container();
    this.config = config;
    this.state = state;
    this.ticker = ticker;
    this.width = width;
    this.height = height;
    this.done = new Promise(resolve => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    // Kick off background load first so its PNG decode overlaps the rest of
    // init below — on iOS the decode is synchronous on the main thread.
    const bgLoadP = Assets.load(this.config.background);

    // Dim overlay (full screen)
    this.dimOverlay = new Graphics();
    this.drawDimOverlay();
    this.container.addChild(this.dimOverlay);

    // Battle area container with angled bottom mask
    this.battleArea = new Container();
    this.container.addChild(this.battleArea);
    this.battleMask = new Graphics();
    this.drawBattleMask();
    this.container.addChild(this.battleMask);
    this.battleArea.mask = this.battleMask;

    // Background
    const bgTexture = await bgLoadP;
    this.bgSprite = new Sprite(bgTexture);
    this.bgSprite.anchor.set(0.5, 1);
    this.battleArea.addChild(this.bgSprite);
    this.layoutBg();

    // Horizontal progress bar (no-board mode)
    if (this.config.progressBar) {
      this.container.addChild(this.config.progressBar.container);
      this.config.progressBar.layout(this.width, this.height);
    }

    // Skill bar (below battle area) — hidden until layoutSkillBar()
    this.skillBar = new Container();
    this.skillBar.visible = false;
    this.container.addChild(this.skillBar);
    await this.buildSkillBar();

    // Create and init the fight engine
    const battleH = this.height * BATTLE_AREA_RATIO;
    this.engine = new FightEngine(
      this.config, this.state, this.ticker,
      this.battleArea, this.width, battleH,
    );
    await this.engine.init();
    this.engine.onSkillActivated = (skillId) => this.pulseSkillIcon(skillId);
    this.engine.onSkillCharging = (skillId) => this.chargeSkillIcon(skillId);
    this.engine.onMidFightOverlay = (step) => this.handleMidFightOverlay(step);

    // Berserk: scale player up during melee attacks
    this.wireBerserk();

    this.ready = true;
    // Re-apply layout at the latest dimensions in case a resize arrived during
    // the async load above (when the !ready guard dropped it).
    this.layout(this.width, this.height);
    this.skillBar.visible = true;

    // Run the fight — resolves done when complete
    this.engine.run().then(() => {
      this.resolveDone();
    });
  }

  async exit(): Promise<void> {
    // Remove progress bar so director can re-add it to the next scene
    if (this.config.progressBar) {
      this.container.removeChild(this.config.progressBar.container);
    }
    // Free Spine physics + VRAM so CPU cost doesn't compound across fights
    this.engine.destroyActors();
  }

  update(deltaMS: number): void {
    if (!this.ready) return;
    this.config.progressBar?.update(deltaMS);
    if (this.activeOverlay) {
      this.activeOverlay.update(deltaMS);
    }
  }

  pause(): void {
    this.container.interactiveChildren = false;
  }

  resume(): void {
    this.container.interactiveChildren = true;
  }

  setSkipVictoryFade(skip: boolean): void {
    if (this.engine) this.engine.skipVictoryFade = skip;
  }

  layout(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (!this.ready) return;
    this.drawDimOverlay();
    this.drawBattleMask();
    this.layoutBg();
    this.layoutSkillBar();
    this.config.progressBar?.layout(width, height);
    this.engine.setViewport(width, height * BATTLE_AREA_RATIO);
    this.engine.layoutActors();
    // Mid-fight overlays (level-up / weapon reward) live in this scene's
    // container, not on the SceneManager stack, so sceneManager.layout() never
    // reaches them — forward the resize here so they relayout too.
    if (this.overlayDim) {
      this.overlayDim.clear();
      this.overlayDim.rect(0, 0, width, height).fill({ color: 0x000000, alpha: DIM_ALPHA });
    }
    this.activeOverlay?.layout(width, height);
  }

  private drawDimOverlay(): void {
    this.dimOverlay.clear();
    this.dimOverlay.rect(0, 0, this.width, this.height)
      .fill({ color: 0x000000, alpha: DIM_ALPHA });
  }

  private drawBattleMask(): void {
    const battleH = this.height * BATTLE_AREA_RATIO;
    const skew = this.height * BATTLE_SKEW;
    this.battleMask.clear();
    this.battleMask.poly([
      0, 0, this.width, 0,
      this.width, battleH - skew,
      0, battleH + skew,
    ]).fill({ color: 0xffffff });
  }

  private layoutBg(): void {
    const battleH = this.height * BATTLE_AREA_RATIO;
    const vScale = viewportScale(this.width, this.height);

    // Scale battle area from center when viewport is small
    this.battleArea.scale.set(vScale);
    this.battleArea.pivot.set(this.width / 2, battleH / 2);
    this.battleArea.position.set(this.width / 2, battleH / 2);

    // Position bg in battle-area-local coords (unscaled)
    this.bgSprite.anchor.set(0.5, 0.5);
    this.bgSprite.scale.set(0.34);
    this.bgSprite.x = this.width / 2;
    this.bgSprite.y = battleH / 2;
  }

  // ── Berserk ─────────────────────────────────────────

  private wireBerserk(): void {
    if (!this.state.skills.includes('berserk')) return;
    if (this.engine.onBeforeMelee) return; // already wired

    const BERSERK_SCALE = 1.4;
    const BERSERK_MS = 200;
    this.engine.onBeforeMelee = async (actor) => {
      const spine = actor.character.spine;
      const baseScale = Math.abs(spine.scale.x);
      const signX = spine.scale.x >= 0 ? 1 : -1;
      const signY = spine.scale.y >= 0 ? 1 : -1;
      await this.engine.tween(BERSERK_MS, (t) => {
        const s = baseScale + (baseScale * BERSERK_SCALE - baseScale) * t;
        spine.scale.set(s * signX, s * signY);
      });
    };
    this.engine.onAfterMelee = async (actor) => {
      const spine = actor.character.spine;
      const currentScale = Math.abs(spine.scale.x);
      const charScale = this.config.characterScale ?? 0.12;
      const baseScale = actor.config.scale ?? actor.config.spine.defaultScale ?? charScale;
      const signX = spine.scale.x >= 0 ? 1 : -1;
      const signY = spine.scale.y >= 0 ? 1 : -1;
      await this.engine.tween(BERSERK_MS, (t) => {
        const s = currentScale + (baseScale - currentScale) * t;
        spine.scale.set(s * signX, s * signY);
      });
    };
  }

  // ── Mid-Fight Overlay ──────────────────────────────────

  private async handleMidFightOverlay(step: FightStepLevelUp | FightStepWeaponReward): Promise<void> {
    // Add dim layer on top of fight
    const overlayDim = new Graphics();
    overlayDim.rect(0, 0, this.width, this.height)
      .fill({ color: 0x000000, alpha: DIM_ALPHA });
    this.container.addChild(overlayDim);
    this.overlayDim = overlayDim;

    // Create the overlay scene
    let scene: Scene;
    if (step.type === 'levelup') {
      let config = step.config;
      if (!config) {
        const allSkills = this.config.allSkills ?? [];
        const isFirst = this.state.skills.length === 0;
        const skills = computeLevelUpSkills(allSkills, this.state.skills, isFirst);
        config = { skills: [skills as SkillConfig[]] };
      }
      this.midFightLevelUpCount++;
      scene = new LevelUpScene(config, this.state, this.ticker, this.width, this.height);
    } else {
      if (step.atkBoost) {
        this.state.atk = step.atkBoost;
      }
      scene = new WeaponRewardScene(step.config, this.state, this.width, this.height);
    }

    this.container.addChild(scene.container);
    this.activeOverlay = scene;
    await scene.enter();
    await scene.done;
    await scene.exit();

    // Tear down overlay
    this.activeOverlay = null;
    this.overlayDim = null;
    this.container.removeChild(scene.container);
    this.container.removeChild(overlayDim);

    // Hot-reload: rebuild skill bar and re-wire berserk
    await this.rebuildSkillBar();
    this.wireBerserk();
  }

  private async rebuildSkillBar(): Promise<void> {
    // Clear old skill bar contents
    this.skillBar.removeChildren();
    this.skillIcons = [];
    this.skillIdToIcon.clear();
    this.skillChargeOverlays.clear();

    // Rebuild
    await this.buildSkillBar();
    this.layoutSkillBar();
  }

  // ── Skill Bar ─────────────────────────────────────────

  private async buildSkillBar(): Promise<void> {
    const allSkills = this.config.allSkills ?? [];
    const acquiredSkills = this.state.skills
      .map(id => allSkills.find(s => s.id === id))
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

      // Icon sprite (Deadly Stars: two shuriken with offset)
      if (skill.icon) {
        const tex = await Assets.load(skill.icon);
        const padding = 4;
        const iconScale = (SKILL_ICON_SIZE - padding * 2) / Math.max(tex.width, tex.height);
        if (skill.id === 'deadlyStars') {
          const dualScale = iconScale * 0.75;
          const s1 = new Sprite(tex);
          s1.anchor.set(0.5);
          s1.scale.set(dualScale);
          s1.position.set(SKILL_ICON_SIZE / 2 - 6, SKILL_ICON_SIZE / 2 - 4);
          iconContainer.addChild(s1);
          const s2 = new Sprite(tex);
          s2.anchor.set(0.5);
          s2.scale.set(dualScale);
          s2.position.set(SKILL_ICON_SIZE / 2 + 6, SKILL_ICON_SIZE / 2 + 4);
          iconContainer.addChild(s2);
        } else {
          const sprite = new Sprite(tex);
          sprite.anchor.set(0.5);
          sprite.scale.set(iconScale);
          sprite.position.set(SKILL_ICON_SIZE / 2, SKILL_ICON_SIZE / 2);
          iconContainer.addChild(sprite);
        }
      }

      // Charge overlay (masked to rounded rect shape)
      const chargeMask = new Graphics();
      chargeMask.roundRect(0, 0, SKILL_ICON_SIZE, SKILL_ICON_SIZE, SKILL_ICON_RADIUS)
        .fill({ color: 0xffffff });
      iconContainer.addChild(chargeMask);
      const chargeOverlay = new Graphics();
      chargeOverlay.mask = chargeMask;
      chargeOverlay.visible = false;
      iconContainer.addChild(chargeOverlay);
      this.skillChargeOverlays.set(skill.id, chargeOverlay);

      // Set pivot to center for scale animation
      iconContainer.pivot.set(SKILL_ICON_SIZE / 2, SKILL_ICON_SIZE / 2);

      this.skillIcons.push(iconContainer);
      this.skillIdToIcon.set(skill.id, iconContainer);
      this.skillBar.addChild(iconContainer);
    }
  }

  private layoutSkillBar(): void {
    if (this.skillIcons.length === 0) return;

    const vScale = viewportScale(this.width, this.height);
    const iconSize = SKILL_ICON_SIZE * vScale;
    const iconGap = SKILL_ICON_GAP * vScale;
    this.skillBar.scale.set(vScale);

    const battleH = this.height * BATTLE_AREA_RATIO;
    const totalRows = Math.ceil(this.skillIcons.length / SKILL_GRID_COLS);
    const gridH = totalRows * SKILL_ICON_SIZE + (totalRows - 1) * SKILL_ICON_GAP;
    // Center skill grid vertically in remaining space below battle area
    const remainingH = (this.height - battleH) / vScale;
    const gridTop = battleH / vScale + (remainingH - gridH) / 2 + SKILL_ICON_SIZE / 2;

    for (let i = 0; i < this.skillIcons.length; i++) {
      const row = Math.floor(i / SKILL_GRID_COLS);
      const col = i % SKILL_GRID_COLS;
      // Number of icons in this row (last row may have fewer)
      const rowCount = row < totalRows - 1
        ? SKILL_GRID_COLS
        : this.skillIcons.length - row * SKILL_GRID_COLS;
      const rowW = rowCount * SKILL_ICON_SIZE + (rowCount - 1) * SKILL_ICON_GAP;
      const rowLeft = (this.width / vScale - rowW) / 2;
      this.skillIcons[i].position.set(
        rowLeft + col * (SKILL_ICON_SIZE + SKILL_ICON_GAP) + SKILL_ICON_SIZE / 2,
        gridTop + row * (SKILL_ICON_SIZE + SKILL_ICON_GAP),
      );
    }
  }

  private pulseSkillIcon(skillId: string): void {
    const icon = this.skillIdToIcon.get(skillId);
    if (!icon) return;

    // Pulse: scale up then back down
    let elapsed = 0;
    const handler = (ticker: Ticker) => {
      elapsed += ticker.deltaMS;
      const t = Math.min(1, elapsed / PULSE_MS);
      // Ease out-in: scale up in first half, back down in second
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

  private chargeSkillIcon(skillId: string): Promise<void> {
    const overlay = this.skillChargeOverlays.get(skillId);
    if (!overlay) return Promise.resolve();

    overlay.visible = true;

    return new Promise<void>(resolve => {
      let elapsed = 0;
      const handler = (ticker: Ticker) => {
        elapsed += ticker.deltaMS;
        const t = Math.min(1, elapsed / CHARGE_MS);
        // easeOutQuad — fast start, decelerating fill
        const e = t * (2 - t);

        // Fill from bottom to top
        const fillH = SKILL_ICON_SIZE * e;
        const y = SKILL_ICON_SIZE - fillH;
        overlay.clear();
        overlay.rect(0, y, SKILL_ICON_SIZE, fillH)
          .fill({ color: CHARGE_COLOR, alpha: CHARGE_ALPHA });

        if (t >= 1) {
          this.ticker.remove(handler);
          // Brief fade-out
          let fadeElapsed = 0;
          const fadeHandler = (ft: Ticker) => {
            fadeElapsed += ft.deltaMS;
            const ft2 = Math.min(1, fadeElapsed / 60);
            overlay.alpha = 1 - ft2;
            if (ft2 >= 1) {
              overlay.visible = false;
              overlay.alpha = 1;
              overlay.clear();
              this.ticker.remove(fadeHandler);
              resolve();
            }
          };
          this.ticker.add(fadeHandler);
        }
      };
      this.ticker.add(handler);
    });
  }
}

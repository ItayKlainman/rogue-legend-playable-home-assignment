import { Container, Ticker } from 'pixi.js';
import { SpineCharacter } from '@shared/SpineCharacter';
import { HpBar } from '../HpBar';
import { RageBar } from './RageBar';
import type { ActorConfig } from './FightStep';

export class FightActor {
  readonly character: SpineCharacter;
  readonly hpBar: HpBar;
  readonly rageBar: RageBar | null;
  readonly config: ActorConfig;
  readonly side: 'player' | 'enemy';
  readonly index: number;

  hp: number;
  maxHp: number;
  rage: number;
  maxRage: number;
  dead = false;

  /** Position the actor returns to after melee approach. Set by FightEngine.layoutActors(). */
  homeX = 0;
  homeY = 0;

  constructor(
    character: SpineCharacter,
    config: ActorConfig,
    side: 'player' | 'enemy',
    index: number,
  ) {
    this.character = character;
    this.config = config;
    this.side = side;
    this.index = index;

    this.maxHp = config.maxHp;
    this.hp = config.hp ?? config.maxHp;
    this.maxRage = config.maxRage ?? 0;
    this.rage = 0;

    this.hpBar = new HpBar(this.hp, this.maxHp);
    this.rageBar = this.maxRage > 0 ? new RageBar(this.maxRage) : null;
  }

  static async create(
    config: ActorConfig,
    side: 'player' | 'enemy',
    index: number,
    ticker: Ticker,
    cachePrefix: string,
  ): Promise<FightActor> {
    const id = `${cachePrefix}_${side}${index}`;
    const character = await SpineCharacter.create(id, config.spine, ticker, {
      skin: config.skin,
    });
    // Use fallback chain for idle — not all enemies have 'Idle'
    const skeleton = character.spine.skeleton;
    for (const name of ['Idle', 'Idle_Full', 'Idle_Loop']) {
      if (skeleton.data.findAnimation(name)) {
        character.play(name, true);
        break;
      }
    }
    return new FightActor(character, config, side, index);
  }

  /** Add this actor's display objects (spine, hpBar, rageBar) to a parent container. */
  addTo(parent: Container): void {
    parent.addChild(this.character.spine);
    parent.addChild(this.hpBar.container);
    if (this.rageBar) {
      parent.addChild(this.rageBar.container);
    }
  }

  /** Update HP visually (immediate, no tween). */
  setHp(newHp: number): void {
    this.hp = Math.max(0, Math.min(newHp, this.maxHp));
    this.hpBar.setHp(this.hp);
  }

  /** Update rage visually. */
  setRage(newRage: number): void {
    if (!this.rageBar) return;
    this.rage = Math.max(0, Math.min(newRage, this.maxRage));
    this.rageBar.setRage(this.rage);
  }
}

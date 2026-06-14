import type { WeaponConfig } from '@shared/SpineCharacter';

import ninjaKatanaData from 'assets/Weapons/NinjaKatana.webp';

export const NINJA_KATANA: WeaponConfig = {
  spriteData: ninjaKatanaData,
  position: { x: 2.56, y: 0.8 },
  rotation: -31.4,
  scale: 1.8,
};

export { ninjaKatanaData as ninjaKatanaUIData };

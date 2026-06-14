import type { WeaponConfig } from '@shared/SpineCharacter';

import spriteData from 'assets/Weapons/CrystalHammer.webp';

export const CRYSTAL_HAMMER: WeaponConfig = {
  spriteData,
  position: { x: 2.16, y: -0.4},
  rotation: -59.7,
  scale: 1.55,
  glow: {
    color: 0x44aaff,
    distance: 15,
    outerStrength: 4,
    quality: 1,
    pulseSpeed: 1200,
  },
};

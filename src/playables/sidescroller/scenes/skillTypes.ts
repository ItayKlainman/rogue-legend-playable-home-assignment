export type Rarity = 'common' | 'legendary' | 'mythic';

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  icon?: string;
  family?: string;
  tier?: number;
}

export const RARITY_COLORS: Record<Rarity, {
  badge: number;
  accent: number;
  cardBg: number;
  cardBorder: number;
  skillBg: number;
  skillBorder: number;
}> = {
  common: {
    badge: 0x7B8794,
    accent: 0xA0AAB4,
    cardBg: 0xFFF1D7,
    cardBorder: 0xC8CCD0,
    skillBg: 0x8786AA,
    skillBorder: 0xCCCAE9,
  },
  legendary: {
    badge: 0xE67E22,
    accent: 0xF5A623,
    cardBg: 0xFFF1D7,
    cardBorder: 0xF5A623,
    skillBg: 0xD7704A,
    skillBorder: 0xFFC600,
  },
  mythic: {
    badge: 0xC0392B,
    accent: 0xE74C6F,
    cardBg: 0xFFF1D7,
    cardBorder: 0xE74C6F,
    skillBg: 0xD7704A,
    skillBorder: 0xFFC600,
  },
};

export type Rarity = 'common' | 'epic' | 'legendary' | 'mythic';

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
  epic: {
    badge: 0x8E44AD,
    accent: 0xB35EE8,
    cardBg: 0xFFF1D7,
    cardBorder: 0xB35EE8,
    skillBg: 0x6E4AA0,
    skillBorder: 0xD671FD,
  },
  legendary: {
    badge: 0xE67E22,
    accent: 0xFFB020,
    cardBg: 0xFFF1D7,
    cardBorder: 0xFFB020,
    skillBg: 0xC9711F,
    skillBorder: 0xFFD23F,
  },
  mythic: {
    badge: 0x8E1B1B,
    accent: 0xE03131,
    cardBg: 0xFFF1D7,
    cardBorder: 0xE03131,
    skillBg: 0xA12020,
    skillBorder: 0xFF5A4A,
  },
};

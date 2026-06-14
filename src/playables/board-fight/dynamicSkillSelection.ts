import type { SkillConfig } from './skills';

/**
 * Computes which skills to offer in a dynamic level-up based on
 * the player's current skill set.
 *
 * Rules:
 * - For each family, offer the next tier the player doesn't have yet.
 *   If the family is fully maxed (T3), skip it.
 * - First level-up: always show the 3 T1 family skills.
 * - Subsequent level-ups: berserk (misc, no family) has 50% chance
 *   to replace a random unchosen-family T1 skill.
 *
 * Returns 2–3 SkillConfig entries.
 */
export function computeLevelUpSkills(
  allSkills: SkillConfig[],
  playerSkillIds: string[],
  isFirstLevelUp: boolean,
): SkillConfig[] {
  // Group family skills by family → sorted by tier
  const families = new Map<string, SkillConfig[]>();
  let berserkSkill: SkillConfig | undefined;

  for (const skill of allSkills) {
    if (skill.family) {
      if (!families.has(skill.family)) families.set(skill.family, []);
      families.get(skill.family)!.push(skill);
    } else if (skill.id === 'berserk') {
      berserkSkill = skill;
    }
  }

  // Sort each family by tier ascending
  for (const skills of families.values()) {
    skills.sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));
  }

  // For each family, find the next skill to offer
  const choices: SkillConfig[] = [];
  const unchosenT1Indices: number[] = []; // indices into choices that are unchosen T1

  for (const [, familySkills] of families) {
    // Find highest tier the player owns in this family
    let highestOwned = 0;
    for (const s of familySkills) {
      if (playerSkillIds.includes(s.id)) {
        highestOwned = Math.max(highestOwned, s.tier ?? 0);
      }
    }

    // Find next tier to offer
    const nextSkill = familySkills.find(s => (s.tier ?? 0) === highestOwned + 1);
    if (nextSkill) {
      const idx = choices.length;
      choices.push(nextSkill);
      if (highestOwned === 0) {
        unchosenT1Indices.push(idx);
      }
    }
    // If no next skill, family is maxed — skip
  }

  // Berserk replacement (not on first level-up, not if already owned)
  if (
    !isFirstLevelUp &&
    berserkSkill &&
    !playerSkillIds.includes(berserkSkill.id) &&
    unchosenT1Indices.length > 0 &&
    Math.random() < 0.5
  ) {
    const replaceIdx = unchosenT1Indices[Math.floor(Math.random() * unchosenT1Indices.length)];
    choices[replaceIdx] = berserkSkill;
  }

  return choices;
}

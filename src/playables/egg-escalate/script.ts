// Escalating two-fight flow: small fight (hero + Glacidrake) → collect Boneclaw
// → boss fight (hero + Glacidrake + Boneclaw). Pets are real battle-pet Spines.
export interface EggEscalateScript {
  /** Reward pet revealed after the first fight, shown on the reveal banner. */
  rewardPetName: string;
}

export const ESCALATE_SCRIPT: EggEscalateScript = {
  rewardPetName: 'Boneclaw',
};

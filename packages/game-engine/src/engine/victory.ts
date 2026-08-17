import { isBloodBlade, isBud, isWhiteRose } from '../config/cards.js';
import type { Card, Faction, GameState, RoundResolution } from '../types.js';

export type VictoryEvaluation = {
  winner: Faction | null;
  reason: string | null;
};

export const evaluateRoundResolution = (
  state: GameState,
  resolution: RoundResolution,
): VictoryEvaluation => {
  if (resolution.hasWhiteRose && resolution.hasBloodBlade) {
    return { winner: 'BLOOD_BLADE', reason: 'WHITE_ROSE_KILLED' };
  }

  const sacrificeTotal = state.sacrificePile.filter(isBud).length;
  const deathTotal = state.deathPile.filter(isBud).length;

  if (resolution.whiteRoseSafe && sacrificeTotal >= state.rules.sacrificeThreshold) {
    return { winner: 'WHITE_ROSE', reason: 'SACRIFICE_THRESHOLD' };
  }

  if (deathTotal >= state.rules.deathThreshold) {
    return { winner: 'BLOOD_BLADE', reason: 'DEATH_THRESHOLD' };
  }

  return { winner: null, reason: null };
};

export const allPlayersUsedCrystal = (state: GameState): boolean =>
  state.players.every((player) => player.crystalUsed);

export const evaluateFinalCrystal = (state: GameState): VictoryEvaluation => {
  const whiteFactionHand: Card[] = state.players
    .filter((player) => player.faction === 'WHITE_ROSE')
    .flatMap((player) => player.hand);

  const whiteRoseCards = whiteFactionHand.filter(isWhiteRose).length;
  const budCards = whiteFactionHand.filter(isBud).length;

  if (whiteRoseCards === 0 && budCards === 0) {
    return { winner: 'WHITE_ROSE', reason: 'FINAL_CRYSTAL_NO_WHITE_CARDS' };
  }

  return { winner: 'BLOOD_BLADE', reason: 'FINAL_CRYSTAL_WHITE_CARDS_REMAIN' };
};

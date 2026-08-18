import { describe, expect, it } from 'vitest';
import type { Card, GameState, Role } from '../src/index.js';
import { checkVictoryAndAdvance } from '../src/index.js';
import { advanceThroughNight, createStateWithRoles, setHand } from './helpers.js';

const makeFinalState = (roles: Role[], whiteHands: Card[][]): GameState => {
  let state = createStateWithRoles(roles);
  state = advanceThroughNight(state);
  const players = state.players.map((player) => {
    const isWhite = player.faction === 'WHITE_ROSE';
    const index = state.players.findIndex((p) => p.id === player.id);
    const hand = isWhite ? (whiteHands[index] ?? []) : player.hand;
    return {
      ...player,
      crystalUsed: true,
      crystal: null,
      hasCrystal: false,
      hand,
      handCount: hand.length,
    };
  });
  if (!state.round) throw new Error('No round');
  return {
    ...state,
    phase: 'CHECK_VICTORY',
    players,
    round: {
      ...state.round,
      resolution: {
        hasBloodBlade: false,
        hasWhiteRose: false,
        budCount: 0,
        sacrificePile: [],
        deathPile: [],
        bladePile: [],
        whiteRoseSafe: false,
      },
    },
  };
};

describe('Final Crystal Rule', () => {
  it('WHITE_ROSE faction wins if all its remaining hands have no WHITE_ROSE/BUD', () => {
    const state = makeFinalState(
      ['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'],
      [['GHOST'], ['GHOST'], ['GHOST']],
    );
    const result = checkVictoryAndAdvance(state);
    expect(result.phase).toBe('GAME_OVER');
    expect(result.winner).toBe('WHITE_ROSE');
    expect(result.winReason).toBe('FINAL_CRYSTAL_NO_WHITE_CARDS');
  });

  it('BLOOD_BLADE wins if any WHITE_ROSE faction hand still has WHITE_ROSE or BUD', () => {
    const state = makeFinalState(
      ['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'],
      [['WHITE_ROSE'], ['GHOST'], ['GHOST']],
    );
    const result = checkVictoryAndAdvance(state);
    expect(result.phase).toBe('GAME_OVER');
    expect(result.winner).toBe('BLOOD_BLADE');
    expect(result.winReason).toBe('FINAL_CRYSTAL_WHITE_CARDS_REMAIN');
  });

  it('does not use non-white faction hands in the final check', () => {
    const state = makeFinalState(
      ['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'],
      [['GHOST'], ['GHOST'], ['GHOST']],
    );
    const result = checkVictoryAndAdvance(state);
    expect(result.winner).toBe('WHITE_ROSE');
  });
});

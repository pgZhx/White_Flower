import { describe, expect, it } from 'vitest';
import type { Card, GameState, Role } from '../src/index.js';
import { resolveRound, checkVictoryAndAdvance, selectSpeakingOrder, endSpeaking } from '../src/index.js';
import { advanceThroughNight, createStateWithRoles } from './helpers.js';

const stateWithReveal = (roles: Role[], revealCards: Card[]): GameState => {
  let state = createStateWithRoles(roles);
  state = advanceThroughNight(state);
  if (!state.round) throw new Error('No round');
  return {
    ...state,
    phase: 'ROUND_RESOLUTION',
    round: {
      ...state.round,
      reveal: { cards: revealCards, playerMap: null, shuffled: true },
      resolution: null,
    },
  };
};

describe('Round Resolution', () => {
  it('sacrifices BUD when no blood blade is revealed', () => {
    const state = stateWithReveal(
      ['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'],
      ['WHITE_ROSE', 'BELIEVER', 'BISHOP', 'GHOST'],
    );
    const resolved = resolveRound(state);
    expect(resolved.whiteRoseSafe).toBe(true);
    expect(resolved.sacrificePile).toEqual(['BELIEVER', 'BISHOP']);
    expect(resolved.deathPile).toEqual([]);
  });

  it('kills BUD when at least one blood blade is revealed', () => {
    const state = stateWithReveal(
      ['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'],
      ['DARK_KNIFE', 'BELIEVER', 'BISHOP'],
    );
    const resolved = resolveRound(state);
    expect(resolved.whiteRoseSafe).toBe(false);
    expect(resolved.deathPile).toEqual(['BELIEVER', 'BISHOP']);
    expect(resolved.bladePile).toEqual(['DARK_KNIFE']);
  });

  it('multiple blood blades do not cause extra kills', () => {
    const state = stateWithReveal(
      ['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'],
      ['DOUBLE_KNIFE', 'DARK_KNIFE', 'BELIEVER'],
    );
    const resolved = resolveRound(state);
    expect(resolved.deathPile).toEqual(['BELIEVER']);
    expect(resolved.bladePile).toEqual(['DOUBLE_KNIFE', 'DARK_KNIFE']);
  });

  it('marks White Rose safe when no blood blade is present', () => {
    const state = stateWithReveal(
      ['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'],
      ['WHITE_ROSE', 'GHOST'],
    );
    const resolved = resolveRound(state);
    expect(resolved.whiteRoseSafe).toBe(true);
  });

  it('immediately wins for BLOOD_BLADE when WHITE_ROSE and a blade are revealed together', () => {
    const state = stateWithReveal(
      ['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'],
      ['WHITE_ROSE', 'DARK_KNIFE'],
    );
    const resolved = resolveRound(state);
    const result = checkVictoryAndAdvance(resolved);
    expect(result.phase).toBe('GAME_OVER');
    expect(result.winner).toBe('BLOOD_BLADE');
    expect(result.winReason).toBe('WHITE_ROSE_KILLED');
  });

  it('does not get stuck when all players pass', () => {
    let state = stateWithReveal(
      ['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'],
      [],
    );
    state = resolveRound(state);
    const result = checkVictoryAndAdvance(state);
    expect(result.phase).toBe('ROUND_SPEAKING_PHASE');
    expect(result.roundNumber).toBe(1);
    expect(result.round?.reveal).not.toBeNull();

    let next = selectSpeakingOrder(result, result.currentCoinHolderId ?? 'p0', 'p1', 'CLOCKWISE');
    for (let i = 0; i < 5; i += 1) {
      next = endSpeaking(next, next.voice.currentSpeakerId as string);
    }
    expect(next.phase).toBe('COIN_OWNER_SUMMARY_PHASE');
    next = endSpeaking(next, next.voice.currentSpeakerId as string);
    expect(next.phase).toBe('ROUND_MAGIC_SELECT');
    expect(next.roundNumber).toBe(2);
    expect(next.round?.reveal).toBeNull();
  });
});

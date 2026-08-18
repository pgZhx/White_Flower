import { describe, expect, it } from 'vitest';
import type { GameState, MagicId, Role } from '../src/index.js';
import {
  resolveCurrentMagic,
  startPlayerActions,
  submitAction,
  submitMagic10Target,
  submitMagic10Replacement,
  SeededRandom,
} from '../src/index.js';
import { advanceThroughNight, createStateWithRoles, setHand, playerById } from './helpers.js';

const random = new SeededRandom(42);

const baseMagicState = (
  roles: Role[],
  magicId: MagicId,
  casterId = 'p0',
): GameState => {
  let state = createStateWithRoles(roles);
  state = advanceThroughNight(state);
  if (!state.round) throw new Error('No round');
  return {
    ...state,
    phase: 'MAGIC_RESOLUTION',
    currentCoinHolderId: casterId,
    round: {
      ...state.round,
      magicNumber: magicId,
      crystalRevealerId: casterId,
    },
  };
};

describe('Magic 1 and 12', () => {
  const roles: Role[] = ['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'];

  it.each([1, 12])('Magic %p forces another player to play', (magicId) => {
    const state = baseMagicState(roles, magicId as MagicId);
    const next = resolveCurrentMagic(state, ['p1'], random);
    expect(next.phase).toBe('PLAYER_ACTIONS');
    expect(next.round?.forcedPlay).toContain('p1');
  });

  it.each([1, 12])('Magic %p rejects self target', (magicId) => {
    const state = baseMagicState(roles, magicId as MagicId);
    expect(() => resolveCurrentMagic(state, ['p0'], random)).toThrow();
  });

  it.each([1, 12])('Magic %p skips when no other player has hand', (magicId) => {
    let state = baseMagicState(roles, magicId as MagicId);
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      state = setHand(state, id, []);
    }
    const next = resolveCurrentMagic(state, [], random);
    expect(next.phase).toBe('PLAYER_ACTIONS');
    expect(next.round?.forcedPlay).toEqual([]);
  });

  it.each([1, 12])('Magic %p creates a mandatory constraint', (magicId) => {
    let state = baseMagicState(roles, magicId as MagicId);
    state = resolveCurrentMagic(state, ['p1'], random);
    // p1 is second in action order if p0 starts; force p0 to pass first to reach p1
    state = submitAction(state, 'p0', 'PASS', null, random);
    expect(() => submitAction(state, 'p1', 'PASS', null, random)).toThrow();
  });
});

describe('Magic 2', () => {
  it('disables shuffle for the round', () => {
    const state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 2);
    const next = resolveCurrentMagic(state, [], random);
    expect(next.round?.noShuffle).toBe(true);
  });

  it('does not need a target and accepts empty target list', () => {
    const state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 2);
    const next = resolveCurrentMagic(state, [], random);
    expect(next.phase).toBe('PLAYER_ACTIONS');
  });
});

describe('Magic 3 and 4', () => {
  const roles: Role[] = ['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'];

  it('Magic 3 forces right neighbor to random play', () => {
    const state = baseMagicState(roles, 3);
    const next = resolveCurrentMagic(state, [], random);
    expect(next.round?.randomForcedRight).toBe('p1');
  });

  it('Magic 4 forces left neighbor to random play', () => {
    const state = baseMagicState(roles, 4);
    const next = resolveCurrentMagic(state, [], random);
    expect(next.round?.randomForcedLeft).toBe('p4');
  });

  it('Magic 3 random-forced player cannot choose the card', () => {
    let state = baseMagicState(roles, 3);
    state = resolveCurrentMagic(state, [], random);
    // p0 acts first; let p0 pass to reach p1
    state = submitAction(state, 'p0', 'PASS', null, random);
    const beforeHand = playerById(state, 'p1').hand;
    const next = submitAction(state, 'p1', 'PLAY', beforeHand[0] ?? 'GHOST', random);
    const afterHand = playerById(next, 'p1').hand;
    expect(afterHand.length).toBe(beforeHand.length - 1);
  });

  it('Magic 3 allows pass when forced neighbor has no hand', () => {
    let state = baseMagicState(roles, 3);
    state = setHand(state, 'p1', []);
    state = resolveCurrentMagic(state, [], random);
    state = submitAction(state, 'p0', 'PASS', null, random);
    const next = submitAction(state, 'p1', 'PASS', null, random);
    expect(next.round?.actions['p1']).toEqual({ type: 'PASS' });
  });

  it('Magic 4 allows pass when forced neighbor has no hand', () => {
    let state = baseMagicState(roles, 4);
    state = setHand(state, 'p4', []);
    state = resolveCurrentMagic(state, [], random);
    // p0,p1,p2,p3,p4 order; pass all before p4
    state = submitAction(state, 'p0', 'PASS', null, random);
    state = submitAction(state, 'p1', 'PASS', null, random);
    state = submitAction(state, 'p2', 'PASS', null, random);
    state = submitAction(state, 'p3', 'PASS', null, random);
    const next = submitAction(state, 'p4', 'PASS', null, random);
    expect(next.round?.actions['p4']).toEqual({ type: 'PASS' });
  });
});

describe('Magic 5', () => {
  it('stores pair and computes earlier/later by action order', () => {
    const state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 5);
    const next = resolveCurrentMagic(state, ['p2', 'p1'], random);
    // p0,p1,p2... so p1 earlier, p2 later
    expect(next.round?.magic5Constraint).toEqual({ earlierId: 'p1', laterId: 'p2' });
  });

  it('rejects fewer than two targets', () => {
    const state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 5);
    expect(() => resolveCurrentMagic(state, ['p1'], random)).toThrow();
  });

  it('rejects a target without hand', () => {
    let state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 5);
    state = setHand(state, 'p1', []);
    expect(() => resolveCurrentMagic(state, ['p1', 'p2'], random)).toThrow();
  });

  it('enforces that later player follows earlier player action type', () => {
    let state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 5);
    state = resolveCurrentMagic(state, ['p2', 'p1'], random);
    // p1 earlier, p2 later
    state = submitAction(state, 'p0', 'PASS', null, random);
    state = submitAction(state, 'p1', 'PASS', null, random);
    expect(() => submitAction(state, 'p2', 'PLAY', 'BELIEVER', random)).toThrow();
  });
});

describe('Magic 6', () => {
  it('moves caster to last when LAST is chosen', () => {
    const state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 6);
    const next = resolveCurrentMagic(state, [], random, 'LAST');
    expect(next.round?.actionOrder).toEqual(['p1', 'p2', 'p3', 'p4', 'p0']);
  });

  it('keeps caster first when FIRST is chosen', () => {
    const state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 6);
    const next = resolveCurrentMagic(state, [], random, 'FIRST');
    expect(next.round?.actionOrder?.[0]).toBe('p0');
  });

  it('rejects missing choice', () => {
    const state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 6);
    expect(() => resolveCurrentMagic(state, [], random)).toThrow();
  });
});

describe('Magic 7', () => {
  it('adds GHOST to target hand', () => {
    let state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 7);
    state = resolveCurrentMagic(state, ['p1'], random);
    expect(playerById(state, 'p1').hand).toContain('GHOST');
    expect(playerById(state, 'p1').handCount).toBe(4);
  });

  it('rejects target without hand', () => {
    let state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 7);
    state = setHand(state, 'p1', []);
    expect(() => resolveCurrentMagic(state, ['p1'], random)).toThrow();
  });
});

describe('Magic 8', () => {
  it('forces left and right neighbors to play', () => {
    const state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 8);
    const next = resolveCurrentMagic(state, [], random);
    expect(next.round?.magic8Neighbors).toEqual({ centerId: 'p0', leftId: 'p4', rightId: 'p1' });
  });

  it('allows pass for a neighbor with no hand', () => {
    let state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 8);
    state = setHand(state, 'p4', []);
    state = resolveCurrentMagic(state, [], random);
    // p0 pass, p1 must play (has hand), p2 pass, p3 pass, p4 can pass
    state = submitAction(state, 'p0', 'PASS', null, random);
    state = submitAction(state, 'p1', 'PLAY', playerById(state, 'p1').hand[0] ?? 'GHOST', random);
    state = submitAction(state, 'p2', 'PASS', null, random);
    state = submitAction(state, 'p3', 'PASS', null, random);
    const next = submitAction(state, 'p4', 'PASS', null, random);
    expect(next.round?.actions['p4']).toEqual({ type: 'PASS' });
  });
});

describe('Magic 9', () => {
  it('gives DARK_KNIFE the two white-role players without mapping', () => {
    const state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 9);
    const next = resolveCurrentMagic(state, [], random);
    const dk = playerById(next, 'p4');
    expect(dk.magic9Reveal).toEqual({ playerAId: 'p0', playerBId: 'p1' });
  });
});

describe('Magic 10', () => {
  it('creates a pending pre-reveal magic and enters player actions', () => {
    const state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 10);
    const next = resolveCurrentMagic(state, [], random);
    expect(next.phase).toBe('PLAYER_ACTIONS');
    expect(next.round?.pendingMagic10?.casterId).toBe('p0');
  });

  it('can be skipped before reveal', () => {
    let state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 10);
    state = resolveCurrentMagic(state, [], random);
    state = startPlayerActions(state);
    // Let all players pass.
    for (let i = 0; i < 5; i += 1) {
      state = submitAction(state, `p${i}`, 'PASS', null, random);
    }
    expect(state.phase).toBe('PRE_REVEAL_MAGIC');
    const next = submitMagic10Target(state, 'p0', null);
    expect(next.phase).toBe('ROUND_REVEAL');
  });

  it('allows target replacement when target has remaining hand', () => {
    let state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 10);
    state = resolveCurrentMagic(state, [], random);
    // Force p0 to pass, p1 plays a card, then let others pass.
    state = submitAction(state, 'p0', 'PASS', null, random);
    state = submitAction(state, 'p1', 'PLAY', 'BELIEVER', random);
    state = submitAction(state, 'p2', 'PASS', null, random);
    state = submitAction(state, 'p3', 'PASS', null, random);
    state = submitAction(state, 'p4', 'PASS', null, random);
    expect(state.phase).toBe('PRE_REVEAL_MAGIC');
    state = submitMagic10Target(state, 'p0', 'p1');
    expect(state.round?.pendingMagic10?.targetId).toBe('p1');
    const replacement = playerById(state, 'p1').hand[0];
    if (!replacement) throw new Error('No replacement card');
    const next = submitMagic10Replacement(state, 'p1', replacement);
    expect(next.phase).toBe('ROUND_REVEAL');
    expect(next.round?.actions['p1']?.type).toBe('PLAYED');
  });

  it('rejects target who did not play a card', () => {
    let state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 10);
    state = resolveCurrentMagic(state, [], random);
    for (let i = 0; i < 5; i += 1) {
      state = submitAction(state, `p${i}`, 'PASS', null, random);
    }
    expect(state.phase).toBe('PRE_REVEAL_MAGIC');
    expect(() => submitMagic10Target(state, 'p0', 'p1')).toThrow();
  });

  it('rejects target with no remaining hand after playing', () => {
    let state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 10);
    state = resolveCurrentMagic(state, [], random);
    // Give p1 only one card, play it, then no hand remains.
    state = setHand(state, 'p1', ['BELIEVER']);
    state = submitAction(state, 'p0', 'PASS', null, random);
    state = submitAction(state, 'p1', 'PLAY', 'BELIEVER', random);
    state = submitAction(state, 'p2', 'PASS', null, random);
    state = submitAction(state, 'p3', 'PASS', null, random);
    state = submitAction(state, 'p4', 'PASS', null, random);
    expect(() => submitMagic10Target(state, 'p0', 'p1')).toThrow();
  });
});

describe('Magic 11', () => {
  it('lets caster see a random card from target without removing it', () => {
    const state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 11);
    const next = resolveCurrentMagic(state, ['p1'], random);
    const caster = playerById(next, 'p0');
    expect(caster.magic11Seen?.targetId).toBe('p1');
    expect(caster.magic11Seen?.card).toBeTruthy();
    expect(playerById(next, 'p1').hand.length).toBe(3);
  });

  it('rejects target without hand', () => {
    let state = baseMagicState(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE'], 11);
    state = setHand(state, 'p1', []);
    expect(() => resolveCurrentMagic(state, ['p1'], random)).toThrow();
  });
});

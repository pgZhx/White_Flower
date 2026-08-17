import { describe, expect, it } from 'vitest';
import { buildInitialHand, createStateWithRoles, advanceThroughNight, playerById } from '../src/index.js';

describe('Initial Hand', () => {
  it('WHITE_ROSE starts with WHITE_ROSE + BELIEVER + GHOST', () => {
    expect(buildInitialHand('WHITE_ROSE')).toEqual(['WHITE_ROSE', 'BELIEVER', 'GHOST']);
  });

  it('BELIEVER starts with BELIEVER + BELIEVER + GHOST', () => {
    expect(buildInitialHand('BELIEVER')).toEqual(['BELIEVER', 'BELIEVER', 'GHOST']);
  });

  it('DARK_KNIFE starts with DARK_KNIFE + BELIEVER + GHOST', () => {
    expect(buildInitialHand('DARK_KNIFE')).toEqual(['DARK_KNIFE', 'BELIEVER', 'GHOST']);
  });

  it('DOUBLE_KNIFE after night has DOUBLE_KNIFE + DOUBLE_KNIFE + BELIEVER', () => {
    const state = createStateWithRoles(['WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE']);
    const afterNight = advanceThroughNight(state);
    const dk = playerById(afterNight, 'p3');
    expect(dk.hand).toEqual(['DOUBLE_KNIFE', 'DOUBLE_KNIFE', 'BELIEVER']);
    expect(dk.role).toBe('DOUBLE_KNIFE');
  });
});

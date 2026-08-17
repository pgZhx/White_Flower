import { describe, expect, it } from 'vitest';
import { PLAYER_COUNT_RULES, getPlayerCountRules, ROLE_ORDER } from '../src/index.js';

const expectedRoles: Record<number, Record<string, number>> = {
  5: { WHITE_ROSE: 1, BISHOP: 1, BELIEVER: 1, GREAT_SWORD: 0, DOUBLE_KNIFE: 1, DARK_KNIFE: 1 },
  6: { WHITE_ROSE: 1, BISHOP: 1, BELIEVER: 2, GREAT_SWORD: 0, DOUBLE_KNIFE: 1, DARK_KNIFE: 1 },
  7: { WHITE_ROSE: 1, BISHOP: 1, BELIEVER: 2, GREAT_SWORD: 1, DOUBLE_KNIFE: 1, DARK_KNIFE: 1 },
  8: { WHITE_ROSE: 1, BISHOP: 1, BELIEVER: 3, GREAT_SWORD: 1, DOUBLE_KNIFE: 1, DARK_KNIFE: 1 },
  9: { WHITE_ROSE: 1, BISHOP: 1, BELIEVER: 3, GREAT_SWORD: 2, DOUBLE_KNIFE: 1, DARK_KNIFE: 1 },
  10: { WHITE_ROSE: 1, BISHOP: 1, BELIEVER: 4, GREAT_SWORD: 2, DOUBLE_KNIFE: 1, DARK_KNIFE: 1 },
};

describe('Player Configuration', () => {
  it.each([5, 6, 7, 8, 9, 10])('%p players has correct role counts', (playerCount) => {
    const rules = getPlayerCountRules(playerCount);
    const total = ROLE_ORDER.reduce((sum, role) => sum + rules.roles[role], 0);
    expect(total).toBe(playerCount);
    expect(rules.roles).toEqual(expectedRoles[playerCount]);
  });

  it('exposes all supported configurations from one table', () => {
    expect(PLAYER_COUNT_RULES.map((r) => r.playerCount)).toEqual([5, 6, 7, 8, 9, 10]);
  });

  it('rejects unsupported player counts', () => {
    expect(() => getPlayerCountRules(4)).toThrow();
    expect(() => getPlayerCountRules(11)).toThrow();
  });
});

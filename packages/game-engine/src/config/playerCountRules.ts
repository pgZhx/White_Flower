import type { PlayerCountRules, Role } from '../types.js';

const zeroRoles = (): Record<Role, number> => ({
  WHITE_ROSE: 0,
  BISHOP: 0,
  BELIEVER: 0,
  GREAT_SWORD: 0,
  DOUBLE_KNIFE: 0,
  DARK_KNIFE: 0,
});

export const PLAYER_COUNT_RULES: readonly PlayerCountRules[] = [
  {
    playerCount: 5,
    roles: {
      ...zeroRoles(),
      WHITE_ROSE: 1,
      BISHOP: 1,
      BELIEVER: 1,
      DOUBLE_KNIFE: 1,
      DARK_KNIFE: 1,
    },
    sacrificeThreshold: 3,
    deathThreshold: 4,
  },
  {
    playerCount: 6,
    roles: {
      ...zeroRoles(),
      WHITE_ROSE: 1,
      BISHOP: 1,
      BELIEVER: 2,
      DOUBLE_KNIFE: 1,
      DARK_KNIFE: 1,
    },
    // ⚠️ 冲突待确认：Prompt 后文提到 4/5，这里按主表使用 4/4。
    sacrificeThreshold: 4,
    deathThreshold: 4,
  },
  {
    playerCount: 7,
    roles: {
      ...zeroRoles(),
      WHITE_ROSE: 1,
      BISHOP: 1,
      BELIEVER: 2,
      GREAT_SWORD: 1,
      DOUBLE_KNIFE: 1,
      DARK_KNIFE: 1,
    },
    sacrificeThreshold: 4,
    deathThreshold: 6,
  },
  {
    playerCount: 8,
    roles: {
      ...zeroRoles(),
      WHITE_ROSE: 1,
      BISHOP: 1,
      BELIEVER: 3,
      GREAT_SWORD: 1,
      DOUBLE_KNIFE: 1,
      DARK_KNIFE: 1,
    },
    sacrificeThreshold: 5,
    deathThreshold: 6,
  },
  {
    playerCount: 9,
    roles: {
      ...zeroRoles(),
      WHITE_ROSE: 1,
      BISHOP: 1,
      BELIEVER: 3,
      GREAT_SWORD: 2,
      DOUBLE_KNIFE: 1,
      DARK_KNIFE: 1,
    },
    sacrificeThreshold: 5,
    deathThreshold: 7,
  },
  {
    playerCount: 10,
    roles: {
      ...zeroRoles(),
      WHITE_ROSE: 1,
      BISHOP: 1,
      BELIEVER: 4,
      GREAT_SWORD: 2,
      DOUBLE_KNIFE: 1,
      DARK_KNIFE: 1,
    },
    sacrificeThreshold: 6,
    deathThreshold: 7,
  },
];

export const getPlayerCountRules = (playerCount: number): PlayerCountRules => {
  const rules = PLAYER_COUNT_RULES.find((item) => item.playerCount === playerCount);
  if (!rules) {
    throw new Error(`Unsupported player count: ${playerCount}`);
  }
  return rules;
};

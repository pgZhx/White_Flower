import type { Card, Faction, Role } from '@rose-blade/game-engine';

const ROLE_LABELS: Record<Role, string> = {
  WHITE_ROSE: '白蔷薇',
  BISHOP: '主教',
  BELIEVER: '信徒',
  GREAT_SWORD: '大剑',
  DOUBLE_KNIFE: '双刀',
  DARK_KNIFE: '暗刃',
};

const FACTION_LABELS: Record<Faction, string> = {
  WHITE_ROSE: '白蔷薇阵营',
  BLOOD_BLADE: '血刃阵营',
};

const CARD_LABELS: Record<Card, string> = {
  WHITE_ROSE: '白蔷薇',
  BISHOP: '主教',
  BELIEVER: '信徒',
  GHOST: '幽灵',
  GREAT_SWORD: '大剑',
  DOUBLE_KNIFE: '双刀',
  DARK_KNIFE: '暗刃',
};

export const roleLabel = (role: Role | null): string =>
  role ? ROLE_LABELS[role] : '未知';

export const factionLabel = (faction: Faction | null): string =>
  faction ? FACTION_LABELS[faction] : '未知';

export const cardLabel = (card: Card): string => CARD_LABELS[card];

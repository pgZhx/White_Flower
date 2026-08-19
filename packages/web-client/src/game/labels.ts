import type { Card, Faction, GamePhase, Role } from '@rose-blade/game-engine';

const ROLE_LABELS: Record<Role, string> = {
  WHITE_ROSE: '白蔷薇',
  BISHOP: '司教',
  BELIEVER: '信者',
  GREAT_SWORD: '巨刃',
  DOUBLE_KNIFE: '双刃',
  DARK_KNIFE: '暗刃',
};

const FACTION_LABELS: Record<Faction, string> = {
  WHITE_ROSE: '白蔷薇阵营',
  BLOOD_BLADE: '血刃阵营',
};

const CARD_LABELS: Record<Card, string> = {
  WHITE_ROSE: '白蔷薇',
  BISHOP: '司教',
  BELIEVER: '信者',
  GHOST: '幽魂',
  GREAT_SWORD: '巨刃',
  DOUBLE_KNIFE: '双刃',
  DARK_KNIFE: '暗刃',
};

const PHASE_LABELS: Record<GamePhase, string> = {
  LOBBY: '大厅',
  SETUP: '准备中',
  NIGHT_RECOGNITION: '夜间相认',
  NIGHT_DOUBLE_KNIFE: '双刃夜间',
  ROUND_MAGIC_SELECT: '水晶选择',
  MAGIC_RESOLUTION: '魔法解析',
  PLAYER_ACTIONS: '玩家行动',
  PRE_REVEAL_MAGIC: '揭示前魔法',
  ROUND_REVEAL: '公开牌面',
  ROUND_RESOLUTION: '本轮结算',
  CHECK_VICTORY: '胜负判定',
  GAME_OVER: '游戏结束',
};

export const roleLabel = (role: Role | null): string =>
  role ? ROLE_LABELS[role] : '未知';

export const factionLabel = (faction: Faction | null): string =>
  faction ? FACTION_LABELS[faction] : '未知';

export const cardLabel = (card: Card): string => CARD_LABELS[card];

export const phaseLabel = (phase: GamePhase | 'LOBBY'): string =>
  PHASE_LABELS[phase] ?? phase;

export const formatPile = (cards: Card[]): string => {
  if (cards.length === 0) return '空';
  const counts = new Map<Card, number>();
  for (const card of cards) {
    counts.set(card, (counts.get(card) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([card, count]) => (count > 1 ? `${cardLabel(card)} × ${count}` : cardLabel(card)))
    .join('、');
};

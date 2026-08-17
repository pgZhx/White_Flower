import type { Card, Faction, Role } from '../types.js';

export const CARD_ORDER: readonly Card[] = [
  'WHITE_ROSE',
  'BISHOP',
  'BELIEVER',
  'GHOST',
  'DOUBLE_KNIFE',
  'GREAT_SWORD',
  'DARK_KNIFE',
] as const;

export const ROLE_ORDER: readonly Role[] = [
  'WHITE_ROSE',
  'BISHOP',
  'BELIEVER',
  'GREAT_SWORD',
  'DOUBLE_KNIFE',
  'DARK_KNIFE',
] as const;

export const ROLE_FACTION: Record<Role, Faction> = {
  WHITE_ROSE: 'WHITE_ROSE',
  BISHOP: 'WHITE_ROSE',
  BELIEVER: 'WHITE_ROSE',
  GREAT_SWORD: 'BLOOD_BLADE',
  DOUBLE_KNIFE: 'BLOOD_BLADE',
  DARK_KNIFE: 'BLOOD_BLADE',
};

export const BUD_CARDS: readonly Card[] = ['BELIEVER', 'BISHOP'] as const;

export const BLOOD_BLADE_CARDS: readonly Card[] = [
  'DOUBLE_KNIFE',
  'GREAT_SWORD',
  'DARK_KNIFE',
] as const;

export const NIGHT_ROLES: readonly Role[] = [
  'WHITE_ROSE',
  'BISHOP',
  'DOUBLE_KNIFE',
  'GREAT_SWORD',
] as const;

export const isBud = (card: Card): boolean => BUD_CARDS.includes(card as Card);
export const isBloodBlade = (card: Card): boolean => BLOOD_BLADE_CARDS.includes(card as Card);
export const isWhiteRose = (card: Card): boolean => card === 'WHITE_ROSE';

export const removeOneCard = (hand: readonly Card[], card: Card): Card[] => {
  const index = hand.indexOf(card);
  if (index < 0) {
    return [...hand];
  }
  return [...hand.slice(0, index), ...hand.slice(index + 1)];
};

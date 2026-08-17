import { ROLE_FACTION, buildInitialHand } from '../src/index.js';
import type { Card, GameState, Role } from '../src/index.js';
import { createGame, performNightRecognition, performDoubleKnifeNight } from '../src/index.js';

export const makePlayerIds = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `p${i}`);

export const makePlayers = (count: number) =>
  makePlayerIds(count).map((id, i) => ({ id, nickname: `Player${i + 1}` }));

export const createStateWithRoles = (roles: Role[]): GameState => {
  const state = createGame('test-game', makePlayers(roles.length));
  const players = state.players.map((player, index) => {
    const role = roles[index];
    if (!role) throw new Error('Missing role');
    const hand = buildInitialHand(role);
    return {
      ...player,
      role,
      faction: ROLE_FACTION[role],
      hand,
      handCount: hand.length,
      crystal: index + 1,
      hasCrystal: true,
      crystalUsed: false,
    };
  });
  return {
    ...state,
    phase: 'NIGHT_RECOGNITION',
    players,
    version: state.version + 1,
  };
};

export const advanceThroughNight = (state: GameState): GameState => {
  let next = performNightRecognition(state);
  next = performDoubleKnifeNight(next);
  return next;
};

export const setCrystal = (state: GameState, playerId: string, crystal: number | null): GameState => ({
  ...state,
  players: state.players.map((p) =>
    p.id === playerId
      ? { ...p, crystal, hasCrystal: crystal !== null, crystalUsed: crystal === null }
      : p,
  ),
});

export const setHand = (state: GameState, playerId: string, hand: Card[]): GameState => ({
  ...state,
  players: state.players.map((p) =>
    p.id === playerId ? { ...p, hand, handCount: hand.length } : p,
  ),
});

export const playerById = (state: GameState, playerId: string) => {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`Player ${playerId} not found`);
  return player;
};

import { getPlayerCountRules } from '../config/playerCountRules.js';
import { ROLE_FACTION, ROLE_ORDER } from '../config/cards.js';
import type { Card, GameState, PlayerState, RandomProvider, Role } from '../types.js';
import { appendEvent, createEvent } from '../events.js';
import { InvalidPhaseError } from '../errors.js';

export interface NewPlayerInput {
  id: string;
  nickname: string;
}

export const createGame = (id: string, players: NewPlayerInput[]): GameState => {
  if (players.length < 5 || players.length > 10) {
    throw new Error(`Player count must be between 5 and 10, got ${players.length}`);
  }

  const rules = getPlayerCountRules(players.length);

  const playerStates: PlayerState[] = players.map((player, index) => ({
    id: player.id,
    nickname: player.nickname,
    seatIndex: index,
    isConnected: true,
    isReady: false,
    handCount: 0,
    hasCrystal: false,
    crystalUsed: false,
    role: null,
    faction: null,
    hand: [],
    crystal: null,
    nightRecognition: null,
    magic9Reveal: null,
    magic11Seen: null,
  }));

  return {
    id,
    phase: 'SETUP',
    players: playerStates,
    rules,
    roundNumber: 0,
    currentCoinHolderId: null,
    publicCrystalHistory: [],
    sacrificePile: [],
    deathPile: [],
    bladePile: [],
    whiteRoseSafe: false,
    winner: null,
    winReason: null,
    round: null,
    eventLog: [],
    version: 0,
  };
};

export const startGame = (state: GameState, random: RandomProvider): GameState => {
  if (state.phase !== 'SETUP') {
    throw new InvalidPhaseError('SETUP', state.phase);
  }

  const roleList: Role[] = [];
  for (const role of ROLE_ORDER) {
    const count = state.rules.roles[role];
    for (let i = 0; i < count; i += 1) {
      roleList.push(role);
    }
  }

  const shuffledRoles = random.shuffle(roleList);
  const crystalNumbers = random.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).slice(0, state.players.length);

  const players = state.players.map((player, index) => {
    const role = shuffledRoles[index];
    if (!role) {
      throw new Error('Not enough roles assigned');
    }
    const faction = ROLE_FACTION[role];
    const hand = buildInitialHand(role);
    const crystal = crystalNumbers[index] ?? null;
    return {
      ...player,
      role,
      faction,
      hand,
      handCount: hand.length,
      crystal,
      hasCrystal: crystal !== null,
      crystalUsed: false,
    };
  });

  const events = [
    ...state.eventLog,
    createEvent('GAME_STARTED', { gameId: state.id }),
    createEvent('ROLES_ASSIGNED', { playerIds: players.map((p) => p.id) }),
  ];

  return {
    ...state,
    phase: 'NIGHT_RECOGNITION',
    players,
    eventLog: events,
    version: state.version + 1,
  };
};

export const buildInitialHand = (role: Role): Card[] => [role, 'BELIEVER', 'GHOST'];

import { NIGHT_ROLES } from '../config/cards.js';
import type { Card, GameState } from '../types.js';
import { appendEvent, createEvent } from '../events.js';
import { InvalidPhaseError } from '../errors.js';
import { createVoiceState } from './voice.js';

export const performNightRecognition = (state: GameState): GameState => {
  if (state.phase !== 'NIGHT_RECOGNITION') {
    throw new InvalidPhaseError('NIGHT_RECOGNITION', state.phase);
  }

  const nightPlayerIds = state.players
    .filter((player) => player.role !== null && NIGHT_ROLES.includes(player.role))
    .map((player) => player.id);

  const players = state.players.map((player) => {
    if (player.role !== null && NIGHT_ROLES.includes(player.role)) {
      return { ...player, nightRecognition: nightPlayerIds };
    }
    return player;
  });

  const events = appendEvent(
    state.eventLog,
    createEvent('NIGHT_STARTED', { nightPlayerIds }),
  );

  return {
    ...state,
    phase: 'NIGHT_DOUBLE_KNIFE',
    players,
    eventLog: events,
    version: state.version + 1,
  };
};

export const performDoubleKnifeNight = (state: GameState): GameState => {
  if (state.phase !== 'NIGHT_DOUBLE_KNIFE') {
    throw new InvalidPhaseError('NIGHT_DOUBLE_KNIFE', state.phase);
  }

  const players = state.players.map((player) => {
    if (player.role !== 'DOUBLE_KNIFE') {
      return player;
    }
    const hand = (['DOUBLE_KNIFE', 'DOUBLE_KNIFE', 'BELIEVER'] as Card[]);
    return {
      ...player,
      hand,
      handCount: hand.length,
    };
  });

  const firstPlayerId = state.players[0]?.id ?? null;
  const firstSpeakingOrder = state.players.map((player) => player.id);
  const events = appendEvent(
    state.eventLog,
    createEvent('NIGHT_FINISHED', { doubleKnifePlayerIds: players.filter((p) => p.role === 'DOUBLE_KNIFE').map((p) => p.id) }),
  );

  return {
    ...state,
    phase: 'FIRST_SPEAKING_PHASE',
    players,
    roundNumber: 1,
    currentCoinHolderId: firstPlayerId,
    round: createInitialRound(1, firstPlayerId),
    voice: createVoiceState('TURN_BASED', firstPlayerId, firstSpeakingOrder),
    eventLog: events,
    version: state.version + 1,
  };
};

export const createInitialRound = (number: number, coinHolderId: string | null) => ({
  number,
  coinHolderBeforeId: coinHolderId ?? '',
  crystalRevealerId: null,
  magicNumber: null,
  actions: {},
  actionOrder: [],
  currentActionIndex: 0,
  noShuffle: false,
  forcedPlay: [],
  randomForcedLeft: null,
  randomForcedRight: null,
  magic5Targets: [],
  magic5Constraint: null,
  magic8Neighbors: null,
  magic6MoveToEnd: false,
  pendingMagic10: null,
  magic10Resolved: false,
  reveal: null,
  resolution: null,
});

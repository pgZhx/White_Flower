import type {
  Card,
  Faction,
  GameEvent,
  GameState,
  PlayerAction,
  Role,
} from '../types.js';
import { getPlayer } from './magic.js';

export interface ClientPlayerView {
  id: string;
  nickname: string;
  seatIndex: number;
  isConnected: boolean;
  isReady: boolean;
  handCount: number;
  hasCrystal: boolean;
  crystalUsed: boolean;
}

export interface ClientRoundView {
  number: number;
  magicNumber: number | null;
  crystalRevealerId: string | null;
  currentActionIndex: number;
  actionOrder: string[];
  actions: Record<string, 'PLAYED' | 'PASS'>;
  noShuffle: boolean;
  reveal: {
    cards: Card[];
    playerMap: Record<string, Card> | null;
    shuffled: boolean;
  } | null;
  resolution: {
    hasBloodBlade: boolean;
    hasWhiteRose: boolean;
    budCount: number;
    sacrificePile: Card[];
    deathPile: Card[];
    bladePile: Card[];
    whiteRoseSafe: boolean;
  } | null;
}

export interface ClientView {
  id: string;
  phase: GameState['phase'];
  players: ClientPlayerView[];
  currentCoinHolderId: string | null;
  publicCrystalHistory: GameState['publicCrystalHistory'];
  sacrificePile: Card[];
  deathPile: Card[];
  bladePile: Card[];
  whiteRoseSafe: boolean;
  winner: Faction | null;
  winReason: string | null;
  roundNumber: number;
  round: ClientRoundView | null;
  me: {
    playerId: string;
    role: Role | null;
    faction: Faction | null;
    hand: Card[];
    crystal: number | null;
    nightRecognition: string[] | null;
    magic9Reveal: { playerAId: string; playerBId: string } | null;
    magic11Seen: { targetId: string; card: Card } | null;
  };
  eventLog: GameState['eventLog'];
}

const toPublicPlayer = (player: GameState['players'][number]): ClientPlayerView => ({
  id: player.id,
  nickname: player.nickname,
  seatIndex: player.seatIndex,
  isConnected: player.isConnected,
  isReady: player.isReady,
  handCount: player.handCount,
  hasCrystal: player.hasCrystal,
  crystalUsed: player.crystalUsed,
});

const toRoundView = (round: NonNullable<GameState['round']>): ClientRoundView => {
  const actions: Record<string, 'PLAYED' | 'PASS'> = {};
  for (const [playerId, action] of Object.entries(round.actions)) {
    actions[playerId] = action.type;
  }
  return {
    number: round.number,
    magicNumber: round.magicNumber,
    crystalRevealerId: round.crystalRevealerId,
    currentActionIndex: round.currentActionIndex,
    actionOrder: [...round.actionOrder],
    actions,
    noShuffle: round.noShuffle,
    reveal: round.reveal
      ? {
          cards: [...round.reveal.cards],
          playerMap: round.reveal.playerMap ? { ...round.reveal.playerMap } : null,
          shuffled: round.reveal.shuffled,
        }
      : null,
    resolution: round.resolution
      ? {
          hasBloodBlade: round.resolution.hasBloodBlade,
          hasWhiteRose: round.resolution.hasWhiteRose,
          budCount: round.resolution.budCount,
          sacrificePile: [...round.resolution.sacrificePile],
          deathPile: [...round.resolution.deathPile],
          bladePile: [...round.resolution.bladePile],
          whiteRoseSafe: round.resolution.whiteRoseSafe,
        }
      : null,
  };
};

const sanitizeEvent = (event: GameEvent): GameEvent => {
  if (event.type === 'CARD_PLAYED') {
    return { ...event, payload: { playerId: event.payload.playerId } };
  }
  if (event.type === 'NIGHT_STARTED') {
    return { ...event, payload: {} };
  }
  if (event.type === 'NIGHT_FINISHED') {
    return { ...event, payload: {} };
  }
  if (event.type === 'MAGIC_RESOLVED' && event.payload.magicId === 11) {
    const { card: _card, ...rest } = event.payload;
    return { ...event, payload: rest };
  }
  return { ...event, payload: { ...event.payload } };
};

export const buildPlayerView = (state: GameState, viewerId: string): ClientView => {
  const viewer = getPlayer(state, viewerId);

  return {
    id: state.id,
    phase: state.phase,
    players: state.players.map(toPublicPlayer),
    currentCoinHolderId: state.currentCoinHolderId,
    publicCrystalHistory: state.publicCrystalHistory.map((entry) => ({ ...entry })),
    sacrificePile: [...state.sacrificePile],
    deathPile: [...state.deathPile],
    bladePile: [...state.bladePile],
    whiteRoseSafe: state.whiteRoseSafe,
    winner: state.winner,
    winReason: state.winReason,
    roundNumber: state.roundNumber,
    round: state.round ? toRoundView(state.round) : null,
    me: {
      playerId: viewer.id,
      role: viewer.role,
      faction: viewer.faction,
      hand: [...viewer.hand],
      crystal: viewer.crystal,
      nightRecognition: viewer.nightRecognition ? [...viewer.nightRecognition] : null,
      magic9Reveal: viewer.magic9Reveal ? { ...viewer.magic9Reveal } : null,
      magic11Seen: viewer.magic11Seen ? { ...viewer.magic11Seen } : null,
    },
    eventLog: state.eventLog.map(sanitizeEvent),
  };
};

export const actionTypeOf = (action: PlayerAction): 'PLAYED' | 'PASS' => action.type;

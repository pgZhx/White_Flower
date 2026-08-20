import type { Card, GameState, MagicId, PlayerState, RandomProvider } from '../types.js';
import { removeOneCard } from '../config/cards.js';
import { InvalidActionError, InvalidTargetError } from '../errors.js';
import { appendStateEvent, createEvent } from '../events.js';

export const getPlayer = (state: GameState, playerId: string): PlayerState => {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    throw new InvalidTargetError(`Player not found: ${playerId}`);
  }
  return player;
};

export const getOtherPlayersWithHand = (state: GameState, casterId: string): PlayerState[] =>
  state.players.filter((p) => p.id !== casterId && p.hand.length > 0);

export const getSeatIndex = (state: GameState, playerId: string): number => {
  const player = getPlayer(state, playerId);
  return player.seatIndex;
};

export const getRightNeighborId = (state: GameState, playerId: string): string => {
  const index = getSeatIndex(state, playerId);
  const next = (index + 1) % state.players.length;
  const neighbor = state.players[next];
  if (!neighbor) {
    throw new Error('No right neighbor');
  }
  return neighbor.id;
};

export const getLeftNeighborId = (state: GameState, playerId: string): string => {
  const index = getSeatIndex(state, playerId);
  const prev = (index - 1 + state.players.length) % state.players.length;
  const neighbor = state.players[prev];
  if (!neighbor) {
    throw new Error('No left neighbor');
  }
  return neighbor.id;
};

const requireOtherWithHand = (state: GameState, casterId: string, targetIds: string[]): void => {
  if (targetIds.length !== 1) {
    throw new InvalidTargetError('This magic requires exactly one target');
  }
  const targetId = targetIds[0] as string;
  const target = getPlayer(state, targetId);
  if (target.id === casterId) {
    throw new InvalidTargetError('Target cannot be the caster');
  }
  if (target.hand.length === 0) {
    throw new InvalidTargetError('Target must have at least one card');
  }
};

const requireTwoOtherWithHand = (state: GameState, casterId: string, targetIds: string[]): void => {
  if (targetIds.length !== 2) {
    throw new InvalidTargetError('This magic requires exactly two targets');
  }
  const unique = new Set(targetIds);
  if (unique.size !== 2) {
    throw new InvalidTargetError('Targets must be two different players');
  }
  for (const targetId of targetIds) {
    const target = getPlayer(state, targetId);
    if (target.id === casterId) {
      throw new InvalidTargetError('Target cannot be the caster');
    }
    if (target.hand.length === 0) {
      throw new InvalidTargetError('Target must have at least one card');
    }
  }
};

const updatePlayer = (state: GameState, playerId: string, update: (p: PlayerState) => PlayerState): GameState => ({
  ...state,
  players: state.players.map((p) => (p.id === playerId ? update(p) : p)),
});

const updateRound = (state: GameState, update: (r: NonNullable<GameState['round']>) => NonNullable<GameState['round']>): GameState => {
  if (!state.round) {
    throw new Error('No active round');
  }
  return { ...state, round: update(state.round) };
};

export const resolveMagicNow = (
  state: GameState,
  magicId: MagicId,
  casterId: string,
  targetIds: string[],
  random: RandomProvider,
  magic6Choice?: 'FIRST' | 'LAST',
): GameState => {
  getPlayer(state, casterId);

  switch (magicId) {
    case 1:
    case 12: {
      requireOtherWithHand(state, casterId, targetIds);
      const targetId = targetIds[0] as string;
      let next = updateRound(state, (round) => ({
        ...round,
        forcedPlay: [...round.forcedPlay, targetId],
      }));
      next = appendStateEvent(next, createEvent('MAGIC_RESOLVED', { magicId, casterId, targetId }));
      return next;
    }

    case 2: {
      let next = updateRound(state, (round) => ({ ...round, noShuffle: true }));
      next = appendStateEvent(next, createEvent('MAGIC_RESOLVED', { magicId, casterId }));
      return next;
    }

    case 3: {
      const neighborId = getRightNeighborId(state, casterId);
      let next = updateRound(state, (round) => ({ ...round, randomForcedRight: neighborId }));
      next = appendStateEvent(next, createEvent('MAGIC_RESOLVED', { magicId, casterId, neighborId }));
      return next;
    }

    case 4: {
      const neighborId = getLeftNeighborId(state, casterId);
      let next = updateRound(state, (round) => ({ ...round, randomForcedLeft: neighborId }));
      next = appendStateEvent(next, createEvent('MAGIC_RESOLVED', { magicId, casterId, neighborId }));
      return next;
    }

    case 5: {
      requireTwoOtherWithHand(state, casterId, targetIds);
      let next = updateRound(state, (round) => ({
        ...round,
        magic5Targets: [...targetIds],
      }));
      next = appendStateEvent(next, createEvent('MAGIC_RESOLVED', { magicId, casterId, targetIds }));
      return next;
    }

    case 6: {
      if (magic6Choice !== 'FIRST' && magic6Choice !== 'LAST') {
        throw new InvalidActionError('Magic 6 requires choice FIRST or LAST');
      }
      let next = updateRound(state, (round) => ({
        ...round,
        magic6MoveToEnd: magic6Choice === 'LAST',
      }));
      next = appendStateEvent(next, createEvent('MAGIC_RESOLVED', { magicId, casterId, choice: magic6Choice }));
      return next;
    }

    case 7: {
      requireOtherWithHand(state, casterId, targetIds);
      const targetId = targetIds[0] as string;
      let next = updatePlayer(state, targetId, (player) => {
        const hand: Card[] = [...player.hand, 'GHOST'];
        return { ...player, hand, handCount: hand.length };
      });
      next = appendStateEvent(next, createEvent('MAGIC_RESOLVED', { magicId, casterId, targetId }));
      return next;
    }

    case 8: {
      const leftId = getLeftNeighborId(state, casterId);
      const rightId = getRightNeighborId(state, casterId);
      let next = updateRound(state, (round) => ({
        ...round,
        magic8Neighbors: { centerId: casterId, leftId, rightId },
      }));
      next = appendStateEvent(next, createEvent('MAGIC_RESOLVED', { magicId, casterId, leftId, rightId }));
      return next;
    }

    case 9: {
      const whiteRose = state.players.find((p) => p.role === 'WHITE_ROSE');
      const bishop = state.players.find((p) => p.role === 'BISHOP');
      const darkKnife = state.players.find((p) => p.role === 'DARK_KNIFE');
      if (!whiteRose || !bishop || !darkKnife) {
        throw new Error('Cannot resolve Magic 9: missing WHITE_ROSE, BISHOP or DARK_KNIFE');
      }
      let next = updatePlayer(state, darkKnife.id, (player) => ({
        ...player,
        magic9Reveal: { playerAId: whiteRose.id, playerBId: bishop.id },
      }));
      next = appendStateEvent(next, createEvent('MAGIC_RESOLVED', { magicId, casterId }));
      return next;
    }

    case 10: {
      let next = updateRound(state, (round) => ({
        ...round,
        pendingMagic10: {
          casterId,
          targetId: null,
          originalCard: null,
          replacementCard: null,
          resolved: false,
        },
      }));
      next = appendStateEvent(next, createEvent('MAGIC_STARTED', { magicId, casterId }));
      return next;
    }

    case 11: {
      requireOtherWithHand(state, casterId, targetIds);
      const targetId = targetIds[0] as string;
      const target = getPlayer(state, targetId);
      const card = random.pick(target.hand);
      let next = updatePlayer(state, casterId, (player) => ({
        ...player,
        magic11Seen: { targetId, card },
      }));
      next = appendStateEvent(next, createEvent('MAGIC_RESOLVED', { magicId, casterId, targetId, card }));
      return next;
    }

    default:
      throw new Error(`Unknown magic id: ${magicId}`);
  }
};

export const applyMagic10 = (
  state: GameState,
  casterId: string,
  targetId: string | null,
  replacementCard: Card | null,
): GameState => {
  if (!state.round?.pendingMagic10 || state.round.pendingMagic10.casterId !== casterId) {
    throw new InvalidActionError('No pending Magic 10 for this caster');
  }

  if (targetId === null) {
    let next = updateRound(state, (round) => ({
      ...round,
      pendingMagic10: {
        ...(round.pendingMagic10 as NonNullable<typeof round.pendingMagic10>),
        resolved: true,
      },
      magic10Resolved: true,
    }));
    next = appendStateEvent(next, createEvent('MAGIC_RESOLVED', { magicId: 10, casterId, skipped: true }));
    return next;
  }

  const target = getPlayer(state, targetId);
  const action = state.round?.actions[targetId];
  if (!action || action.type !== 'PLAYED' || !action.card) {
    throw new InvalidTargetError('Magic 10 target must have played a card this round');
  }
  if (target.hand.length === 0) {
    throw new InvalidTargetError('Magic 10 target must have at least one remaining hand card');
  }
  if (replacementCard === null || !target.hand.includes(replacementCard)) {
    throw new InvalidTargetError('Replacement card must be in the target hand after their original play');
  }

  const originalCard = action.card;
  // The played card returns to hand, then one physical card from the remaining
  // hand is removed and submitted. Duplicate card faces are separate entries
  // in the hand array, so replacing a card with another copy is legal.
  const newHand = removeOneCard([...target.hand, originalCard], replacementCard);
  const playedCard = replacementCard;
  const newActions = { ...(state.round?.actions ?? {}) };
  newActions[targetId] = { type: 'PLAYED', card: playedCard, originalCard };

  let next: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === targetId ? { ...p, hand: newHand, handCount: newHand.length } : p)),
    round: state.round
      ? {
          ...state.round,
          actions: newActions,
          pendingMagic10: {
            casterId,
            targetId,
            originalCard,
            replacementCard,
            resolved: true,
          },
          magic10Resolved: true,
        }
      : null,
  };
  next = appendStateEvent(next, createEvent('MAGIC_RESOLVED', { magicId: 10, casterId, targetId, originalCard, replacementCard }));
  return next;
};

export const magicRequiresTargetInput = (magicId: MagicId): boolean =>
  magicId === 1 || magicId === 5 || magicId === 7 || magicId === 11 || magicId === 12;

export const magicRequiresChoiceInput = (magicId: MagicId): boolean => magicId === 6;

export const hasLegalTargets = (state: GameState, magicId: MagicId, casterId: string): boolean => {
  const othersWithHand = getOtherPlayersWithHand(state, casterId);
  if (magicId === 5) {
    return othersWithHand.length >= 2;
  }
  if (magicRequiresTargetInput(magicId)) {
    return othersWithHand.length >= 1;
  }
  return true;
};

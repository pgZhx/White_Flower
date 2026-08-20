import { isBloodBlade, isBud, isWhiteRose, removeOneCard } from '../config/cards.js';
import type { Card, GameState, MagicId, PlayerAction, RandomProvider, RevealResult, RoundState } from '../types.js';
import { InvalidActionError, InvalidPhaseError, InvalidTargetError, NotYourTurnError } from '../errors.js';
import { appendEvent, appendStateEvent, createEvent } from '../events.js';
import { getLeftNeighborId, getPlayer, getRightNeighborId, resolveMagicNow, applyMagic10, hasLegalTargets, magicRequiresTargetInput } from './magic.js';
import { createInitialRound } from './night.js';
import { allPlayersUsedCrystal, evaluateFinalCrystal, evaluateRoundResolution } from './victory.js';

export const selectCoinTarget = (state: GameState, targetId: string): GameState => {
  if (state.phase !== 'ROUND_MAGIC_SELECT') {
    throw new InvalidPhaseError('ROUND_MAGIC_SELECT', state.phase);
  }
  if (!state.round) {
    throw new Error('No active round');
  }
  if (!state.currentCoinHolderId) {
    throw new Error('No current coin holder');
  }

  const target = getPlayer(state, targetId);
  if (target.crystalUsed || target.crystal === null) {
    throw new InvalidTargetError('Target player does not have an unused crystal');
  }

  const crystalNumber = target.crystal;
  const nextPlayers = state.players.map((player) =>
    player.id === targetId
      ? { ...player, crystalUsed: true, crystal: null, hasCrystal: false }
      : player,
  );

  const nextRound = {
    ...state.round,
    coinHolderBeforeId: state.currentCoinHolderId,
    crystalRevealerId: targetId,
    magicNumber: crystalNumber as MagicId,
  };

  const nextHistory = [
    ...state.publicCrystalHistory,
    { playerId: targetId, number: crystalNumber, roundNumber: state.roundNumber },
  ];

  let next: GameState = {
    ...state,
    phase: 'MAGIC_RESOLUTION',
    players: nextPlayers,
    currentCoinHolderId: targetId,
    publicCrystalHistory: nextHistory,
    round: nextRound,
    version: state.version + 1,
  };

  next = appendStateEvent(next, createEvent('COIN_TRANSFERRED', { fromId: state.currentCoinHolderId, toId: targetId }));
  next = appendStateEvent(next, createEvent('CRYSTAL_REVEALED', { playerId: targetId, number: crystalNumber, roundNumber: state.roundNumber }));
  return next;
};

export const resolveCurrentMagic = (
  state: GameState,
  targetIds: string[],
  random: RandomProvider,
  magic6Choice?: 'FIRST' | 'LAST',
): GameState => {
  if (state.phase !== 'MAGIC_RESOLUTION') {
    throw new InvalidPhaseError('MAGIC_RESOLUTION', state.phase);
  }
  if (!state.round?.magicNumber || !state.round.crystalRevealerId) {
    throw new Error('No magic to resolve');
  }

  const magicId = state.round.magicNumber;
  const casterId = state.round.crystalRevealerId;

  if (magicRequiresTargetInput(magicId) && !hasLegalTargets(state, magicId, casterId)) {
    const skipped = appendEvent(
      state.eventLog,
      createEvent('MAGIC_RESOLVED', { magicId, casterId, skipped: true }),
    );
    return startPlayerActions({ ...state, eventLog: skipped, version: state.version + 1 });
  }

  const next = resolveMagicNow(state, magicId, casterId, targetIds, random, magic6Choice);
  return startPlayerActions(next);
};

export const startPlayerActions = (state: GameState): GameState => {
  if (!state.round?.crystalRevealerId) {
    throw new Error('Cannot start actions without crystal revealer');
  }

  const revealerId = state.round.crystalRevealerId;
  const baseOrder: string[] = [];
  let cursor = getPlayer(state, revealerId).seatIndex;
  for (let i = 0; i < state.players.length; i += 1) {
    const player = state.players[(cursor + i) % state.players.length];
    if (player) {
      baseOrder.push(player.id);
    }
  }

  let actionOrder = baseOrder;
  if (state.round.magic6MoveToEnd) {
    actionOrder = baseOrder.filter((id) => id !== revealerId);
    actionOrder.push(revealerId);
  }

  let magic5Constraint: RoundState['magic5Constraint'] = null;
  if (state.round.magic5Targets.length === 2) {
    const [a, b] = state.round.magic5Targets as [string, string];
    const indexA = actionOrder.indexOf(a);
    const indexB = actionOrder.indexOf(b);
    if (indexA >= 0 && indexB >= 0) {
      magic5Constraint = indexA < indexB ? { earlierId: a, laterId: b } : { earlierId: b, laterId: a };
    }
  }

  const nextRound = {
    ...state.round,
    actionOrder,
    currentActionIndex: 0,
    magic5Constraint,
  };

  return {
    ...state,
    phase: 'PLAYER_ACTIONS',
    round: nextRound,
    version: state.version + 1,
  };
};

const isRandomForced = (state: GameState, playerId: string): boolean => {
  const round = state.round;
  if (!round) return false;
  return (
    round.randomForcedLeft === playerId ||
    round.randomForcedRight === playerId
  );
};

const isMagic8Forced = (state: GameState, playerId: string): boolean => {
  const round = state.round;
  if (!round) return false;
  return (
    round.magic8Neighbors?.leftId === playerId ||
    round.magic8Neighbors?.rightId === playerId
  );
};

const mustPlay = (state: GameState, playerId: string): boolean => {
  const round = state.round;
  if (!round) return false;
  const player = getPlayer(state, playerId);
  if (round.forcedPlay.includes(playerId)) {
    return player.hand.length > 0;
  }
  if (isRandomForced(state, playerId)) {
    return player.hand.length > 0;
  }
  if (isMagic8Forced(state, playerId)) {
    return player.hand.length > 0;
  }
  if (round.magic5Constraint?.laterId === playerId) {
    const earlierAction = round.actions[round.magic5Constraint.earlierId];
    return earlierAction?.type === 'PLAYED';
  }
  return false;
};

const mustPass = (state: GameState, playerId: string): boolean => {
  const round = state.round;
  if (!round) return false;
  if (round.magic5Constraint?.laterId === playerId) {
    const earlierAction = round.actions[round.magic5Constraint.earlierId];
    return earlierAction?.type === 'PASS';
  }
  return false;
};

export const submitAction = (
  state: GameState,
  playerId: string,
  actionType: 'PLAY' | 'PASS',
  card: Card | null,
  random: RandomProvider,
): GameState => {
  if (state.phase !== 'PLAYER_ACTIONS') {
    throw new InvalidPhaseError('PLAYER_ACTIONS', state.phase);
  }
  if (!state.round) {
    throw new Error('No active round');
  }

  const currentPlayerId = state.round.actionOrder[state.round.currentActionIndex];
  if (currentPlayerId !== playerId) {
    throw new NotYourTurnError(`It is not ${playerId}'s turn`);
  }
  if (state.round.actions[playerId]) {
    throw new InvalidActionError('Player has already acted this round');
  }

  const player = getPlayer(state, playerId);

  if (actionType === 'PASS' && mustPlay(state, playerId)) {
    throw new InvalidActionError('This player is required to play a card');
  }
  if (actionType === 'PLAY' && mustPass(state, playerId)) {
    throw new InvalidActionError('This player is required to pass');
  }

  let playedCard: Card | null = card;
  if (actionType === 'PLAY' && isRandomForced(state, playerId) && player.hand.length > 0) {
    playedCard = random.pick(player.hand);
  }

  if (actionType === 'PLAY') {
    if (!playedCard || !player.hand.includes(playedCard)) {
      throw new InvalidActionError('Chosen card is not in hand');
    }
    const newHand = removeOneCard(player.hand, playedCard);
    const action: PlayerAction = { type: 'PLAYED', card: playedCard };
    const nextPlayers = state.players.map((p) =>
      p.id === playerId ? { ...p, hand: newHand, handCount: newHand.length } : p,
    );
    const nextRound = {
      ...state.round,
      actions: { ...state.round.actions, [playerId]: action },
      currentActionIndex: state.round.currentActionIndex + 1,
    };
    let next: GameState = {
      ...state,
      players: nextPlayers,
      round: nextRound,
      version: state.version + 1,
    };
    next = appendStateEvent(next, createEvent('CARD_PLAYED', { playerId, card: playedCard }));
    return afterActionSubmitted(next);
  }

  const action: PlayerAction = { type: 'PASS' };
  const nextRound = {
    ...state.round,
    actions: { ...state.round.actions, [playerId]: action },
    currentActionIndex: state.round.currentActionIndex + 1,
  };
  let next: GameState = {
    ...state,
    round: nextRound,
    version: state.version + 1,
  };
  next = appendStateEvent(next, createEvent('PLAYER_PASSED', { playerId }));
  return afterActionSubmitted(next);
};

const afterActionSubmitted = (state: GameState): GameState => {
  if (!state.round) {
    return state;
  }
  const allActed = state.round.currentActionIndex >= state.round.actionOrder.length;
  if (!allActed) {
    return state;
  }

  if (state.round.pendingMagic10 && !state.round.pendingMagic10.resolved) {
    return { ...state, phase: 'PRE_REVEAL_MAGIC', version: state.version + 1 };
  }

  return { ...state, phase: 'ROUND_REVEAL', version: state.version + 1 };
};

export const submitMagic10Target = (state: GameState, casterId: string, targetId: string | null): GameState => {
  if (state.phase !== 'PRE_REVEAL_MAGIC') {
    throw new InvalidPhaseError('PRE_REVEAL_MAGIC', state.phase);
  }
  const pending = state.round?.pendingMagic10;
  if (!pending || pending.casterId !== casterId || pending.resolved) {
    throw new InvalidActionError('No pending Magic 10 for this caster');
  }

  if (targetId === null) {
    let next = applyMagic10(state, casterId, null, null);
    next = { ...next, phase: 'ROUND_REVEAL', version: next.version + 1 };
    return next;
  }

  const target = getPlayer(state, targetId);
  const action = state.round?.actions[targetId];
  if (!action || action.type !== 'PLAYED') {
    throw new InvalidTargetError('Magic 10 target must have played a card this round');
  }
  if (target.hand.length === 0) {
    throw new InvalidTargetError('Magic 10 target must have at least one remaining hand card');
  }

  const nextRound = {
    ...(state.round as NonNullable<GameState['round']>),
    pendingMagic10: {
      ...pending,
      targetId,
    },
  };

  return {
    ...state,
    round: nextRound,
    version: state.version + 1,
  };
};

export const submitMagic10Replacement = (
  state: GameState,
  targetId: string,
  replacementCard: Card,
): GameState => {
  if (state.phase !== 'PRE_REVEAL_MAGIC') {
    throw new InvalidPhaseError('PRE_REVEAL_MAGIC', state.phase);
  }
  const pending = state.round?.pendingMagic10;
  if (!pending || pending.targetId !== targetId || pending.resolved) {
    throw new InvalidActionError('No pending Magic 10 replacement for this target');
  }

  const originalAction = state.round?.actions[targetId];
  if (!originalAction || originalAction.type !== 'PLAYED' || !originalAction.card) {
    throw new InvalidTargetError('Target did not play a card this round');
  }
  const target = getPlayer(state, targetId);
  if (!target.hand.includes(replacementCard)) {
    throw new InvalidTargetError('Replacement card must be in hand after the original play');
  }

  const casterId = pending.casterId;
  let next = applyMagic10(state, casterId, targetId, replacementCard);
  next = { ...next, phase: 'ROUND_REVEAL', version: next.version + 1 };
  return next;
};

export const revealRound = (state: GameState, random: RandomProvider): GameState => {
  if (state.phase !== 'ROUND_REVEAL') {
    throw new InvalidPhaseError('ROUND_REVEAL', state.phase);
  }
  if (!state.round) {
    throw new Error('No active round');
  }

  const playedEntries = Object.entries(state.round.actions).filter(
    (entry): entry is [string, Extract<PlayerAction, { type: 'PLAYED' }>] => entry[1].type === 'PLAYED',
  );

  let reveal: RevealResult | null = null;
  let events = state.eventLog;

  if (playedEntries.length === 0) {
    reveal = { cards: [], playerMap: null, shuffled: false };
    events = appendEvent(events, createEvent('CARDS_REVEALED', { cards: [], shuffled: false }));
  } else if (state.round.noShuffle) {
    const playerMap: Record<string, Card> = {};
    for (const [playerId, action] of playedEntries) {
      playerMap[playerId] = action.card;
    }
    reveal = {
      cards: playedEntries.map(([, action]) => action.card),
      playerMap,
      shuffled: false,
    };
    events = appendEvent(events, createEvent('CARDS_REVEALED', { cards: reveal.cards, playerMap, shuffled: false }));
  } else {
    const cards = random.shuffle(playedEntries.map(([, action]) => action.card));
    reveal = { cards, playerMap: null, shuffled: true };
    events = appendEvent(events, createEvent('CARDS_SHUFFLED', { count: cards.length }));
    events = appendEvent(events, createEvent('CARDS_REVEALED', { cards, shuffled: true }));
  }

  if (!reveal) {
    throw new Error('Reveal was not created');
  }

  return {
    ...state,
    phase: 'ROUND_RESOLUTION',
    round: { ...state.round, reveal },
    eventLog: events,
    version: state.version + 1,
  };
};

export const resolveRound = (state: GameState): GameState => {
  if (state.phase !== 'ROUND_RESOLUTION') {
    throw new InvalidPhaseError('ROUND_RESOLUTION', state.phase);
  }
  if (!state.round?.reveal) {
    throw new Error('No reveal to resolve');
  }

  const cards = state.round.reveal.cards;
  const hasBloodBlade = cards.some(isBloodBlade);
  const hasWhiteRose = cards.some(isWhiteRose);
  const budCards = cards.filter(isBud);
  const bloodCards = cards.filter(isBloodBlade);
  const budCount = budCards.length;

  let sacrificePile = state.sacrificePile;
  let deathPile = state.deathPile;
  let bladePile = state.bladePile;
  let whiteRoseSafe = state.whiteRoseSafe;
  let events = state.eventLog;

  if (!hasBloodBlade) {
    if (hasWhiteRose) {
      whiteRoseSafe = true;
      events = appendEvent(events, createEvent('WHITE_ROSE_SAFE', {}));
    }
    if (budCards.length > 0) {
      sacrificePile = [...sacrificePile, ...budCards];
      events = appendEvent(events, createEvent('BUD_SACRIFICED', { cards: budCards }));
    }
  } else if (!hasWhiteRose) {
    if (budCards.length > 0) {
      deathPile = [...deathPile, ...budCards];
      events = appendEvent(events, createEvent('BUD_KILLED', { cards: budCards }));
    }
    if (bloodCards.length > 0) {
      bladePile = [...bladePile, ...bloodCards];
    }
  } else {
    events = appendEvent(events, createEvent('WHITE_ROSE_KILLED', {}));
  }

  const resolution = {
    hasBloodBlade,
    hasWhiteRose,
    budCount,
    sacrificePile,
    deathPile,
    bladePile,
    whiteRoseSafe,
  };

  return {
    ...state,
    phase: 'CHECK_VICTORY',
    sacrificePile,
    deathPile,
    bladePile,
    whiteRoseSafe,
    round: state.round ? { ...state.round, resolution } : null,
    eventLog: events,
    version: state.version + 1,
  };
};

export const checkVictoryAndAdvance = (state: GameState): GameState => {
  if (state.phase !== 'CHECK_VICTORY') {
    throw new InvalidPhaseError('CHECK_VICTORY', state.phase);
  }
  if (!state.round?.resolution) {
    throw new Error('No round resolution');
  }

  const normal = evaluateRoundResolution(state, state.round.resolution);
  if (normal.winner) {
    const events = appendEvent(
      state.eventLog,
      createEvent('GAME_FINISHED', { winner: normal.winner, reason: normal.reason }),
    );
    return {
      ...state,
      phase: 'GAME_OVER',
      winner: normal.winner,
      winReason: normal.reason,
      eventLog: events,
      version: state.version + 1,
    };
  }

  if (allPlayersUsedCrystal(state)) {
    const final = evaluateFinalCrystal(state);
    const events = appendEvent(
      state.eventLog,
      createEvent('GAME_FINISHED', { winner: final.winner, reason: final.reason }),
    );
    return {
      ...state,
      phase: 'GAME_OVER',
      winner: final.winner,
      winReason: final.reason,
      eventLog: events,
      version: state.version + 1,
    };
  }

  const previousRevealerId = state.round.crystalRevealerId;
  const nextRoundNumber = state.roundNumber + 1;
  const nextCoinHolderId = previousRevealerId ?? state.players[0]?.id ?? null;
  const events = appendEvent(state.eventLog, createEvent('ROUND_FINISHED', { roundNumber: state.roundNumber }));

  return {
    ...state,
    phase: 'ROUND_MAGIC_SELECT',
    roundNumber: nextRoundNumber,
    currentCoinHolderId: nextCoinHolderId,
    round: createInitialRound(nextRoundNumber, nextCoinHolderId),
    eventLog: events,
    version: state.version + 1,
  };
};

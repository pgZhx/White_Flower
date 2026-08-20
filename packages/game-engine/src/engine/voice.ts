import type { GameState, SpeakingDirection, VoiceMode, VoiceState } from '../types.js';
import { InvalidTargetError } from '../errors.js';

export const createVoiceState = (
  mode: VoiceMode = 'MUTED',
  currentSpeakerId: string | null = null,
  speakerOrder: string[] = [],
): VoiceState => ({
  enabled: true,
  mode,
  currentSpeakerId,
  speakerOrder: [...speakerOrder],
  speakerIndex: currentSpeakerId ? Math.max(0, speakerOrder.indexOf(currentSpeakerId)) : -1,
  remainingSeconds: currentSpeakerId ? 60 : 0,
});

export const muteVoice = (state: GameState): GameState => ({
  ...state,
  voice: createVoiceState('MUTED'),
});

export const buildSpeakingOrder = (
  state: GameState,
  firstPlayerId: string,
  direction: SpeakingDirection,
): string[] => {
  const firstIndex = state.players.findIndex((player) => player.id === firstPlayerId);
  if (firstIndex < 0) {
    throw new InvalidTargetError('Speaking order must start with a player in this game');
  }

  const step = direction === 'CLOCKWISE' ? 1 : -1;
  return state.players.map((_, offset) => {
    const index = (firstIndex + step * offset + state.players.length * 2) % state.players.length;
    return state.players[index]?.id ?? firstPlayerId;
  });
};

export const startVoiceTurn = (state: GameState, mode: VoiceMode, order: string[]): GameState => {
  const firstPlayerId = order[0] ?? null;
  return {
    ...state,
    voice: createVoiceState(mode, firstPlayerId, order),
  };
};

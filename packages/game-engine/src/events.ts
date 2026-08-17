import type { GameEvent, GameEventType } from './types.js';

let eventSequence = 0;

export const createEvent = (
  type: GameEventType,
  payload: Record<string, unknown> = {},
  timestamp = Date.now(),
): GameEvent => {
  eventSequence += 1;
  return {
    id: `evt_${eventSequence}`,
    type,
    payload,
    timestamp,
  };
};

export const appendEvent = (events: GameEvent[], event: GameEvent): GameEvent[] => {
  return [...events, event];
};

export const resetEventSequence = (): void => {
  eventSequence = 0;
};

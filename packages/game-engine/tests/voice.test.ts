import { describe, expect, it } from 'vitest';
import {
  createStateWithRoles,
  advanceThroughNight,
} from './helpers.js';
import { endSpeaking, selectSpeakingOrder, tickSpeaking } from '../src/index.js';

describe('Voice speaking state', () => {
  it('starts the first speaking phase with the host and mutes after it ends', () => {
    const state = advanceThroughNight(createStateWithRoles([
      'WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE',
    ]));
    expect(state.phase).toBe('FIRST_SPEAKING_PHASE');
    expect(state.voice.mode).toBe('TURN_BASED');
    expect(state.voice.currentSpeakerId).toBe('p0');
    expect(state.voice.remainingSeconds).toBe(60);

    let next = state;
    for (let i = 0; i < 5; i += 1) {
      next = endSpeaking(next, next.voice.currentSpeakerId as string);
    }
    expect(next.phase).toBe('INITIAL_COIN_PHASE');
    expect(next.voice.mode).toBe('MUTED');
  });

  it('builds clockwise and counterclockwise orders from the selected first player', () => {
    const state = advanceThroughNight(createStateWithRoles([
      'WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE',
    ]));
    let next = state;
    for (let i = 0; i < 5; i += 1) next = endSpeaking(next, next.voice.currentSpeakerId as string);
    next = {
      ...next,
      phase: 'ROUND_SPEAKING_PHASE',
      currentCoinHolderId: 'p0',
    };

    const clockwise = selectSpeakingOrder(next, 'p0', 'p2', 'CLOCKWISE');
    expect(clockwise.voice.speakerOrder).toEqual(['p2', 'p3', 'p4', 'p0', 'p1']);
    const counterclockwise = selectSpeakingOrder(next, 'p0', 'p2', 'COUNTERCLOCKWISE');
    expect(counterclockwise.voice.speakerOrder).toEqual(['p2', 'p1', 'p0', 'p4', 'p3']);
  });

  it('automatically advances when the 60 second timer reaches zero', async () => {
    const state = advanceThroughNight(createStateWithRoles([
      'WHITE_ROSE', 'BISHOP', 'BELIEVER', 'DOUBLE_KNIFE', 'DARK_KNIFE',
    ]));
    const timed = { ...state, voice: { ...state.voice, remainingSeconds: 1 } };
    const next = tickSpeaking(timed);
    expect(next.voice.currentSpeakerId).toBe('p1');
    expect(next.voice.remainingSeconds).toBe(60);
  });
});

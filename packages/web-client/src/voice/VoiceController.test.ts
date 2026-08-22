import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientView, VoiceState } from '@rose-blade/game-engine';
import { VoiceController } from './VoiceController';
import { VoiceManager } from './VoiceManager';
import type { VoiceSignaling } from './VoiceRoom';

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

function voiceState(mode: VoiceState['mode'], currentSpeakerId: string | null = null): VoiceState {
  return {
    enabled: true,
    mode,
    currentSpeakerId,
    speakerOrder: currentSpeakerId ? [currentSpeakerId] : [],
    speakerIndex: currentSpeakerId ? 0 : -1,
    remainingSeconds: currentSpeakerId ? 60 : 0,
  };
}

function gameView(voice: VoiceState): ClientView {
  return { voice } as ClientView;
}

function signaling(): VoiceSignaling {
  return {
    sendVoiceSignal: vi.fn(),
    onVoiceSignal: vi.fn(() => () => undefined),
    sendVoiceStatus: vi.fn(),
    onVoiceStatus: vi.fn(() => () => undefined),
  };
}

async function setupVoice() {
  const track = {
    id: 'local-microphone',
    kind: 'audio',
    enabled: true,
    readyState: 'live',
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
  const stream = {
    id: 'local-stream',
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });
  const manager = new VoiceManager();
  await manager.requestPermission();
  const controller = new VoiceController('player-a', manager, signaling());
  return { controller, manager, track };
}

afterEach(() => {
  if (originalMediaDevices) {
    Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
  } else {
    Reflect.deleteProperty(navigator, 'mediaDevices');
  }
});

describe('VoiceController microphone rules', () => {
  it('allows every player to control their own microphone in the lobby', async () => {
    const { controller, manager, track } = await setupVoice();
    controller.sync(null);
    expect(manager.isAllowed).toBe(true);
    expect(track.enabled).toBe(true);

    controller.toggleUserEnabled();
    expect(track.enabled).toBe(false);
    controller.toggleUserEnabled();
    expect(track.enabled).toBe(true);
    controller.destroy();
  });

  it('forces the microphone off outside speaking turns', async () => {
    const { controller, manager, track } = await setupVoice();
    controller.sync(gameView(voiceState('MUTED')));
    expect(manager.isAllowed).toBe(false);
    expect(track.enabled).toBe(false);

    controller.toggleUserEnabled();
    expect(track.enabled).toBe(false);
    controller.destroy();
  });

  it('only enables the current player during turn-based speaking', async () => {
    const { controller, manager, track } = await setupVoice();
    controller.sync(gameView(voiceState('TURN_BASED', 'player-a')));
    expect(manager.isAllowed).toBe(true);
    expect(track.enabled).toBe(true);

    controller.sync(gameView(voiceState('TURN_BASED', 'player-b')));
    expect(manager.isAllowed).toBe(false);
    expect(track.enabled).toBe(false);
    controller.destroy();
  });
});

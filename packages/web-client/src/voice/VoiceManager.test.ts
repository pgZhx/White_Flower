import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceManager } from './VoiceManager';

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

function audioTrack(id: string): MediaStreamTrack & { readyState: MediaStreamTrackState } {
  return {
    id,
    kind: 'audio',
    enabled: true,
    readyState: 'live',
    stop: vi.fn(),
    onended: null,
  } as unknown as MediaStreamTrack & { readyState: MediaStreamTrackState };
}

function mediaStream(id: string, track: MediaStreamTrack): MediaStream {
  return {
    id,
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

afterEach(() => {
  vi.useRealTimers();
  if (originalMediaDevices) {
    Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
  } else {
    Reflect.deleteProperty(navigator, 'mediaDevices');
  }
});

describe('VoiceManager microphone recovery', () => {
  it('reacquires and preserves mute state when the browser ends the microphone track', async () => {
    vi.useFakeTimers();
    const firstTrack = audioTrack('microphone-1');
    const secondTrack = audioTrack('microphone-2');
    const getUserMedia = vi.fn()
      .mockResolvedValueOnce(mediaStream('stream-1', firstTrack))
      .mockResolvedValueOnce(mediaStream('stream-2', secondTrack));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    const manager = new VoiceManager();
    await manager.requestPermission();
    manager.setUserEnabled(false);
    firstTrack.readyState = 'ended';
    firstTrack.onended?.(new Event('ended'));
    await vi.advanceTimersByTimeAsync(500);

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(manager.localStream?.getAudioTracks()[0]?.id).toBe('microphone-2');
    expect(secondTrack.enabled).toBe(false);
    manager.destroy();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VoiceManager } from './VoiceManager';
import { VoiceRoom, type VoiceSignal, type VoiceSignaling } from './VoiceRoom';

const localTrack = (id: string): MediaStreamTrack => ({
  id,
  kind: 'audio',
  enabled: true,
  readyState: 'live',
} as MediaStreamTrack);

const localStream = (id: string, track: MediaStreamTrack): MediaStream => ({
  id,
  getAudioTracks: () => [track],
  getTracks: () => [track],
} as unknown as MediaStream);

class FakePeerConnection {
  static instances: FakePeerConnection[] = [];

  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  signalingState: RTCSignalingState = 'stable';
  remoteDescription: RTCSessionDescription | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onsignalingstatechange: (() => void) | null = null;
  readonly senders: Array<{ track: MediaStreamTrack | null }> = [];

  constructor() {
    FakePeerConnection.instances.push(this);
  }

  addTrack(track: MediaStreamTrack): RTCRtpSender {
    const sender = { track };
    this.senders.push(sender);
    return sender as unknown as RTCRtpSender;
  }

  getSenders(): RTCRtpSender[] {
    return this.senders as unknown as RTCRtpSender[];
  }

  removeTrack(sender: RTCRtpSender): void {
    const index = this.senders.indexOf(sender as unknown as { track: MediaStreamTrack | null });
    if (index >= 0) this.senders.splice(index, 1);
  }

  createOffer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: 'offer', sdp: 'm=audio 9 UDP/TLS/RTP/SAVPF 111' });
  }

  createAnswer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: 'answer', sdp: 'm=audio 9 UDP/TLS/RTP/SAVPF 111' });
  }

  setLocalDescription(): Promise<void> {
    return Promise.resolve();
  }

  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description as RTCSessionDescription;
    return Promise.resolve();
  }

  addIceCandidate(): Promise<void> {
    return Promise.resolve();
  }

  close(): void {
    this.connectionState = 'closed';
  }
}

function createSignaling(): VoiceSignaling {
  return {
    sendVoiceSignal: vi.fn((_toPlayerId: string, _signal: VoiceSignal) => undefined),
    onVoiceSignal: vi.fn(() => () => undefined),
    sendVoiceStatus: vi.fn(),
    onVoiceStatus: vi.fn(() => () => undefined),
  };
}

function createManager(playerId: string): VoiceManager {
  const track = localTrack(`${playerId}-microphone`);
  return { localStream: localStream(`${playerId}-local`, track) } as unknown as VoiceManager;
}

describe('VoiceRoom peer topology', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    FakePeerConnection.instances = [];
  });

  it('creates one independent connection and local audio sender per remote player', () => {
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    const rooms = ['A', 'B', 'C'].map((playerId) => new VoiceRoom(playerId, createManager(playerId), createSignaling()));

    for (const room of rooms) room.updateParticipants(['A', 'B', 'C']);

    expect(FakePeerConnection.instances).toHaveLength(6);
    expect(FakePeerConnection.instances.every((peer) => peer.senders.length === 1)).toBe(true);
    expect(FakePeerConnection.instances.every((peer) => peer.senders[0]?.track?.kind === 'audio')).toBe(true);

    for (const room of rooms) room.updateParticipants(['A', 'B', 'C']);
    expect(FakePeerConnection.instances).toHaveLength(6);

    for (const room of rooms) room.destroy();
  });

  it('rebuilds an ICE-failed connection and sends a fresh offer', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    const signaling = createSignaling();
    const room = new VoiceRoom('A', createManager('A'), signaling, {
      reconnectBaseDelayMs: 1,
      reconnectMaxDelayMs: 1,
    });
    room.updateParticipants(['A', 'B']);
    await Promise.resolve();

    const first = FakePeerConnection.instances[0]!;
    first.iceConnectionState = 'failed';
    first.oniceconnectionstatechange?.();
    await vi.advanceTimersByTimeAsync(250);

    expect(FakePeerConnection.instances).toHaveLength(2);
    expect(FakePeerConnection.instances[1]?.senders).toHaveLength(1);
    expect(signaling.sendVoiceSignal).toHaveBeenCalledWith('B', expect.objectContaining({ kind: 'OFFER' }));
    room.destroy();
  });
});

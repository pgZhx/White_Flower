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
  readonly senders: Array<{ track: MediaStreamTrack | null; replaceTrack: (track: MediaStreamTrack | null) => Promise<void> }> = [];

  constructor() {
    FakePeerConnection.instances.push(this);
  }

  addTrack(track: MediaStreamTrack): RTCRtpSender {
    const sender = {
      track,
      replaceTrack: vi.fn(async (nextTrack: MediaStreamTrack | null) => {
        sender.track = nextTrack as MediaStreamTrack;
      }),
    };
    this.senders.push(sender);
    return sender as unknown as RTCRtpSender;
  }

  getSenders(): RTCRtpSender[] {
    return this.senders as unknown as RTCRtpSender[];
  }

  removeTrack(sender: RTCRtpSender): void {
    const index = this.senders.indexOf(sender as unknown as typeof this.senders[number]);
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

  getStats(): Promise<RTCStatsReport> {
    return Promise.resolve(new Map([
      ['inbound-audio', {
        id: 'inbound-audio',
        timestamp: Date.now(),
        type: 'inbound-rtp',
        kind: 'audio',
        bytesReceived: 100,
      }],
      ['outbound-audio', {
        id: 'outbound-audio',
        timestamp: Date.now(),
        type: 'outbound-rtp',
        kind: 'audio',
        bytesSent: 100,
      }],
    ]) as unknown as RTCStatsReport);
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
  return {
    localStream: localStream(`${playerId}-local`, track),
    isEffectivelyEnabled: true,
    subscribe: () => () => undefined,
    ensureLiveMicrophone: () => Promise.resolve(true),
  } as unknown as VoiceManager;
}

function createMutableManager(playerId: string): {
  manager: VoiceManager;
  replaceMicrophone(trackId: string): void;
} {
  let listener: (() => void) | null = null;
  let stream = localStream(`${playerId}-local`, localTrack(`${playerId}-microphone`));
  const manager = {
    get localStream() { return stream; },
    isEffectivelyEnabled: true,
    subscribe: (nextListener: () => void) => {
      listener = nextListener;
      return () => { listener = null; };
    },
    ensureLiveMicrophone: () => Promise.resolve(true),
  } as unknown as VoiceManager;
  return {
    manager,
    replaceMicrophone(trackId: string) {
      stream = localStream(`${playerId}-replacement`, localTrack(trackId));
      listener?.();
    },
  };
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

  it('replaces every sender track when the browser reacquires the microphone', async () => {
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    const mutable = createMutableManager('A');
    const room = new VoiceRoom('A', mutable.manager, createSignaling());
    room.updateParticipants(['A', 'B', 'C']);

    mutable.replaceMicrophone('A-new-microphone');
    await Promise.resolve();

    expect(FakePeerConnection.instances).toHaveLength(2);
    expect(FakePeerConnection.instances.every(
      (peer) => peer.senders[0]?.track?.id === 'A-new-microphone',
    )).toBe(true);
    room.destroy();
  });

  it('rebuilds a connected peer whose RTP audio stops progressing', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    const room = new VoiceRoom('A', createManager('A'), createSignaling(), {
      reconnectBaseDelayMs: 1,
      reconnectMaxDelayMs: 1,
    });
    room.updateParticipants(['A', 'B']);
    const first = FakePeerConnection.instances[0]!;
    first.connectionState = 'connected';
    first.onconnectionstatechange?.();

    await vi.advanceTimersByTimeAsync(21000);

    expect(FakePeerConnection.instances.length).toBeGreaterThan(1);
    room.destroy();
  });
});

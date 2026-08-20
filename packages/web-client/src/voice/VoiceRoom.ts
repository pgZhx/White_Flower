import type { VoiceManager } from './VoiceManager';

export type VoiceSignal =
  | { kind: 'OFFER'; data: RTCSessionDescriptionInit }
  | { kind: 'ANSWER'; data: RTCSessionDescriptionInit }
  | { kind: 'ICE'; data: RTCIceCandidateInit };

export interface VoiceSignaling {
  sendVoiceSignal(toPlayerId: string, signal: VoiceSignal): void;
  onVoiceSignal(handler: (fromPlayerId: string, signal: VoiceSignal) => void): () => void;
  sendVoiceStatus(enabled: boolean): void;
  onVoiceStatus(handler: (playerId: string, enabled: boolean) => void): () => void;
}

interface VoiceConnection {
  peer: RTCPeerConnection;
  pendingCandidates: RTCIceCandidateInit[];
  audio: HTMLAudioElement | null;
}

export class VoiceRoom {
  private readonly connections = new Map<string, VoiceConnection>();
  private readonly participants = new Set<string>();
  private readonly unsubSignal: () => void;
  private destroyed = false;

  constructor(
    private readonly playerId: string,
    private readonly manager: VoiceManager,
    private readonly signaling: VoiceSignaling,
  ) {
    this.unsubSignal = signaling.onVoiceSignal((fromPlayerId, signal) => {
      void this.handleSignal(fromPlayerId, signal);
    });
  }

  updateParticipants(playerIds: string[]): void {
    if (this.destroyed) return;
    const next = new Set(playerIds.filter((id) => id !== this.playerId));
    for (const id of next) {
      this.participants.add(id);
      this.ensureConnection(id);
    }
    for (const id of [...this.participants]) {
      if (!next.has(id)) {
        this.closeConnection(id);
        this.participants.delete(id);
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubSignal();
    for (const id of this.connections.keys()) this.closeConnection(id);
    this.connections.clear();
    this.participants.clear();
  }

  private ensureConnection(remotePlayerId: string): VoiceConnection | null {
    const existing = this.connections.get(remotePlayerId);
    if (existing || typeof RTCPeerConnection === 'undefined') return existing ?? null;

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    const connection: VoiceConnection = { peer, pendingCandidates: [], audio: null };
    this.connections.set(remotePlayerId, connection);

    this.manager.mediaStream?.getAudioTracks().forEach((track) => peer.addTrack(track, this.manager.mediaStream as MediaStream));
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.signaling.sendVoiceSignal(remotePlayerId, { kind: 'ICE', data: event.candidate.toJSON() });
    };
    peer.ontrack = (event) => this.attachAudio(remotePlayerId, event.streams[0] ?? new MediaStream([event.track]));
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed' || peer.connectionState === 'closed') {
        this.closeConnection(remotePlayerId);
      }
    };

    if (this.playerId < remotePlayerId) {
      void this.createOffer(remotePlayerId, connection);
    }
    return connection;
  }

  private async createOffer(remotePlayerId: string, connection: VoiceConnection): Promise<void> {
    try {
      const offer = await connection.peer.createOffer();
      await connection.peer.setLocalDescription(offer);
      this.signaling.sendVoiceSignal(remotePlayerId, { kind: 'OFFER', data: offer });
    } catch {
      // The connection will retry when the participant list or signaling state changes.
    }
  }

  private async handleSignal(remotePlayerId: string, signal: VoiceSignal): Promise<void> {
    const connection = this.ensureConnection(remotePlayerId);
    if (!connection) return;
    try {
      if (signal.kind === 'OFFER') {
        await connection.peer.setRemoteDescription(signal.data);
        const answer = await connection.peer.createAnswer();
        await connection.peer.setLocalDescription(answer);
        this.signaling.sendVoiceSignal(remotePlayerId, { kind: 'ANSWER', data: answer });
        await this.flushCandidates(connection);
        return;
      }
      if (signal.kind === 'ANSWER') {
        await connection.peer.setRemoteDescription(signal.data);
        await this.flushCandidates(connection);
        return;
      }
      if (connection.peer.remoteDescription) {
        await connection.peer.addIceCandidate(signal.data);
      } else {
        connection.pendingCandidates.push(signal.data);
      }
    } catch {
      // A stale ICE candidate or a closed peer connection is safe to ignore.
    }
  }

  private async flushCandidates(connection: VoiceConnection): Promise<void> {
    const candidates = connection.pendingCandidates.splice(0);
    for (const candidate of candidates) await connection.peer.addIceCandidate(candidate);
  }

  private attachAudio(remotePlayerId: string, stream: MediaStream): void {
    const connection = this.connections.get(remotePlayerId);
    if (!connection || typeof Audio === 'undefined') return;
    connection.audio?.remove();
    const audio = new Audio();
    audio.autoplay = true;
    audio.srcObject = stream;
    connection.audio = audio;
    void audio.play().catch(() => undefined);
  }

  private closeConnection(remotePlayerId: string): void {
    const connection = this.connections.get(remotePlayerId);
    if (!connection) return;
    connection.peer.ontrack = null;
    connection.peer.close();
    connection.audio?.remove();
    this.connections.delete(remotePlayerId);
  }
}

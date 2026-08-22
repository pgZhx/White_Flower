import type { VoiceManager } from './VoiceManager';
import { createVoiceRtcConfiguration } from './voiceRtcConfig';

export type VoiceSignal =
  | { kind: 'OFFER'; data: RTCSessionDescriptionInit }
  | { kind: 'ANSWER'; data: RTCSessionDescriptionInit }
  | { kind: 'ICE'; data: RTCIceCandidateInit }
  | { kind: 'RESTART' };

export interface VoiceSignaling {
  sendVoiceSignal(toPlayerId: string, signal: VoiceSignal): void;
  onVoiceSignal(handler: (fromPlayerId: string, signal: VoiceSignal) => void): () => void;
  sendVoiceStatus(enabled: boolean): void;
  onVoiceStatus(handler: (playerId: string, enabled: boolean) => void): () => void;
}

interface VoiceConnection {
  peer: RTCPeerConnection;
  pendingCandidates: RTCIceCandidateInit[];
  localAudioTrackIds: Set<string>;
  makingOffer: boolean;
}

export interface VoiceRoomOptions {
  rtcConfiguration?: RTCConfiguration;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
}

const DEFAULT_RECONNECT_BASE_DELAY_MS = 1000;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 15000;

export class VoiceRoom {
  private readonly connections = new Map<string, VoiceConnection>();
  private readonly participants = new Set<string>();
  private readonly remoteStreams = new Map<string, MediaStream>();
  private readonly remoteAudios = new Map<string, HTMLAudioElement>();
  private readonly reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly reconnectAttempts = new Map<string, number>();
  private readonly unsubSignal: () => void;
  private readonly rtcConfiguration: RTCConfiguration;
  private readonly reconnectBaseDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly unlockAudio = (): void => {
    for (const audio of this.remoteAudios.values()) {
      void this.playRemoteAudio(audio);
    }
  };
  private destroyed = false;

  constructor(
    private readonly playerId: string,
    private readonly manager: VoiceManager,
    private readonly signaling: VoiceSignaling,
    options: VoiceRoomOptions = {},
  ) {
    this.rtcConfiguration = options.rtcConfiguration ?? createVoiceRtcConfiguration();
    this.reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS;
    this.reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS;
    this.unsubSignal = signaling.onVoiceSignal((fromPlayerId, signal) => {
      void this.handleSignal(fromPlayerId, signal);
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', this.unlockAudio, { passive: true });
    }
  }

  updateParticipants(playerIds: string[]): void {
    if (this.destroyed) return;
    const next = new Set(playerIds.filter((id) => id !== this.playerId));
    for (const id of next) {
      if (!this.participants.has(id)) {
        console.log('[player join]', {
          playerId: this.playerId,
          remotePlayerId: id,
          participants: [...next],
        });
      }
      this.participants.add(id);
      this.ensureConnection(id);
    }
    for (const id of [...this.participants]) {
      if (!next.has(id)) {
        this.clearReconnect(id, true);
        this.closeConnection(id);
        this.participants.delete(id);
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubSignal();
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', this.unlockAudio);
    }
    for (const id of this.connections.keys()) this.closeConnection(id);
    for (const timer of this.reconnectTimers.values()) clearTimeout(timer);
    this.connections.clear();
    this.participants.clear();
    this.remoteStreams.clear();
    this.remoteAudios.clear();
    this.reconnectTimers.clear();
    this.reconnectAttempts.clear();
  }

  private ensureConnection(remotePlayerId: string): VoiceConnection | null {
    const existing = this.connections.get(remotePlayerId);
    if (existing || typeof RTCPeerConnection === 'undefined') return existing ?? null;

    const peer = new RTCPeerConnection(this.rtcConfiguration);
    const localStream = this.manager.localStream;
    const localAudioTracks = localStream?.getAudioTracks() ?? [];
    const connection: VoiceConnection = {
      peer,
      pendingCandidates: [],
      localAudioTrackIds: new Set(localAudioTracks.map((track) => track.id)),
      makingOffer: false,
    };
    this.connections.set(remotePlayerId, connection);
    this.logConnection('[create peer connection]', remotePlayerId, peer);

    for (const track of localAudioTracks) {
      peer.addTrack(track, localStream as MediaStream);
      console.log('[add local track]', {
        playerId: this.playerId,
        remotePlayerId,
        trackId: track.id,
        streamId: localStream?.id,
        enabled: track.enabled,
        readyState: track.readyState,
      });
    }
    this.validateLocalSenders(connection, remotePlayerId);
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      if (this.connections.get(remotePlayerId)?.peer !== peer) return;
      this.sendSignal(remotePlayerId, { kind: 'ICE', data: event.candidate.toJSON() });
    };
    peer.ontrack = (event) => {
      const remoteStream = event.streams[0] ?? new MediaStream([event.track]);
      console.log('[receive remote track]', {
        playerId: this.playerId,
        remotePlayerId,
        trackId: event.track.id,
        trackKind: event.track.kind,
        streamId: remoteStream.id,
      });
      this.attachAudio(remotePlayerId, remoteStream);
    };
    peer.onconnectionstatechange = () => {
      this.logConnection('[connection state]', remotePlayerId, peer);
      if (peer.connectionState === 'connected') {
        this.clearReconnect(remotePlayerId, true);
      } else if (peer.connectionState === 'failed') {
        this.scheduleReconnect(remotePlayerId, 'peer connection failed', 250);
      } else if (peer.connectionState === 'disconnected') {
        this.scheduleReconnect(remotePlayerId, 'peer connection disconnected');
      }
    };
    peer.oniceconnectionstatechange = () => {
      this.logConnection('[ice state]', remotePlayerId, peer);
      if (peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed') {
        this.clearReconnect(remotePlayerId, true);
      } else if (peer.iceConnectionState === 'failed') {
        this.scheduleReconnect(remotePlayerId, 'ICE failed', 250);
      } else if (peer.iceConnectionState === 'disconnected') {
        this.scheduleReconnect(remotePlayerId, 'ICE disconnected');
      }
    };
    peer.onsignalingstatechange = () => this.logConnection('[signaling state]', remotePlayerId, peer);

    if (this.playerId < remotePlayerId) {
      void this.createOffer(remotePlayerId, connection);
    }
    return connection;
  }

  private async createOffer(remotePlayerId: string, connection: VoiceConnection): Promise<void> {
    if (connection.makingOffer || connection.peer.signalingState === 'closed') return;
    connection.makingOffer = true;
    try {
      const offer = await connection.peer.createOffer();
      if (this.connections.get(remotePlayerId) !== connection) return;
      if (!offer.sdp?.includes('m=audio')) {
        console.warn('[voice] offer SDP does not contain m=audio');
      }
      await connection.peer.setLocalDescription(offer);
      this.sendSignal(remotePlayerId, { kind: 'OFFER', data: offer });
    } catch (error) {
      console.warn('[voice] failed to create an audio offer', {
        playerId: this.playerId,
        remotePlayerId,
        error,
      });
      this.scheduleReconnect(remotePlayerId, 'offer creation failed');
    } finally {
      connection.makingOffer = false;
    }
  }

  private async handleSignal(remotePlayerId: string, signal: VoiceSignal): Promise<void> {
    if (this.destroyed || remotePlayerId === this.playerId) return;
    if (signal.kind === 'RESTART') {
      if (this.playerId < remotePlayerId && this.participants.has(remotePlayerId)) {
        console.log('[voice] peer requested ICE recovery', {
          playerId: this.playerId,
          remotePlayerId,
        });
        this.clearReconnect(remotePlayerId, false);
        this.replaceConnection(remotePlayerId);
      }
      return;
    }

    let connection = this.ensureConnection(remotePlayerId);
    if (!connection) return;
    try {
      if (signal.kind === 'OFFER') {
        this.clearReconnect(remotePlayerId, false);
        if (connection.peer.signalingState !== 'stable') {
          connection = this.replaceConnection(remotePlayerId);
          if (!connection) return;
        }
        await connection.peer.setRemoteDescription(signal.data);
        const answer = await connection.peer.createAnswer();
        if (!answer.sdp?.includes('m=audio')) {
          console.warn('[voice] answer SDP does not contain m=audio');
        }
        await connection.peer.setLocalDescription(answer);
        this.sendSignal(remotePlayerId, { kind: 'ANSWER', data: answer });
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
    } catch (error) {
      console.warn('[voice] failed to apply signaling message', {
        playerId: this.playerId,
        remotePlayerId,
        signalKind: signal.kind,
        error,
      });
      if (signal.kind !== 'ICE') this.scheduleReconnect(remotePlayerId, `${signal.kind} handling failed`);
    }
  }

  private async flushCandidates(connection: VoiceConnection): Promise<void> {
    const candidates = connection.pendingCandidates.splice(0);
    for (const candidate of candidates) await connection.peer.addIceCandidate(candidate);
  }

  private attachAudio(remotePlayerId: string, stream: MediaStream): void {
    const connection = this.connections.get(remotePlayerId);
    if (!connection || typeof Audio === 'undefined') return;
    this.remoteStreams.set(remotePlayerId, stream);
    this.stopRemoteAudio(remotePlayerId);
    const audio = new Audio();
    audio.autoplay = true;
    audio.srcObject = stream;
    this.remoteAudios.set(remotePlayerId, audio);
    console.log('[remote audio created]', {
      playerId: this.playerId,
      remotePlayerId,
      streamId: stream.id,
      trackIds: stream.getTracks().map((track) => track.id),
    });
    void this.playRemoteAudio(audio);
  }

  private async playRemoteAudio(audio: HTMLAudioElement): Promise<void> {
    try {
      await audio.play();
    } catch (error) {
      console.warn('[voice] remote audio playback was blocked; retrying after user interaction', error);
    }
  }

  private closeConnection(remotePlayerId: string): void {
    const connection = this.connections.get(remotePlayerId);
    if (!connection) return;
    connection.peer.onicecandidate = null;
    connection.peer.ontrack = null;
    connection.peer.onconnectionstatechange = null;
    connection.peer.oniceconnectionstatechange = null;
    connection.peer.onsignalingstatechange = null;
    connection.peer.close();
    this.stopRemoteAudio(remotePlayerId);
    this.remoteStreams.delete(remotePlayerId);
    this.connections.delete(remotePlayerId);
  }

  private replaceConnection(remotePlayerId: string): VoiceConnection | null {
    this.closeConnection(remotePlayerId);
    return this.ensureConnection(remotePlayerId);
  }

  private scheduleReconnect(remotePlayerId: string, reason: string, requestedDelayMs?: number): void {
    if (this.destroyed || !this.participants.has(remotePlayerId) || this.reconnectTimers.has(remotePlayerId)) return;
    const attempt = (this.reconnectAttempts.get(remotePlayerId) ?? 0) + 1;
    this.reconnectAttempts.set(remotePlayerId, attempt);
    const exponentialDelay = Math.min(
      this.reconnectBaseDelayMs * (2 ** Math.min(attempt - 1, 4)),
      this.reconnectMaxDelayMs,
    );
    const delayMs = requestedDelayMs ?? exponentialDelay;
    console.warn('[voice] scheduling peer connection recovery', {
      playerId: this.playerId,
      remotePlayerId,
      reason,
      attempt,
      delayMs,
    });
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(remotePlayerId);
      if (this.destroyed || !this.participants.has(remotePlayerId)) return;
      this.replaceConnection(remotePlayerId);
      if (this.playerId > remotePlayerId) {
        this.sendSignal(remotePlayerId, { kind: 'RESTART' });
      }
    }, delayMs);
    this.reconnectTimers.set(remotePlayerId, timer);
  }

  private clearReconnect(remotePlayerId: string, resetAttempts: boolean): void {
    const timer = this.reconnectTimers.get(remotePlayerId);
    if (timer) clearTimeout(timer);
    this.reconnectTimers.delete(remotePlayerId);
    if (resetAttempts) this.reconnectAttempts.delete(remotePlayerId);
  }

  private sendSignal(remotePlayerId: string, signal: VoiceSignal): void {
    try {
      this.signaling.sendVoiceSignal(remotePlayerId, signal);
    } catch (error) {
      console.warn('[voice] failed to send signaling message', {
        playerId: this.playerId,
        remotePlayerId,
        signalKind: signal.kind,
        error,
      });
      this.scheduleReconnect(remotePlayerId, 'voice signaling unavailable');
    }
  }

  private validateLocalSenders(connection: VoiceConnection, remotePlayerId: string): void {
    const audioSenders = connection.peer.getSenders().filter((sender) => sender.track?.kind === 'audio');
    for (const sender of audioSenders) {
      const track = sender.track;
      if (!track || !connection.localAudioTrackIds.has(track.id)) {
        console.error('[voice] invalid non-local audio sender; removing it', {
          playerId: this.playerId,
          remotePlayerId,
          trackId: track?.id,
        });
        connection.peer.removeTrack(sender);
      }
    }
    const localSender = connection.peer.getSenders().find(
      (sender) => sender.track?.kind === 'audio' && connection.localAudioTrackIds.has(sender.track.id),
    );
    if (!localSender) {
      console.warn('[voice] RTCPeerConnection has no local audio sender after addTrack', {
        playerId: this.playerId,
        remotePlayerId,
        localTrackIds: [...connection.localAudioTrackIds],
      });
    }
  }

  private stopRemoteAudio(remotePlayerId: string): void {
    const audio = this.remoteAudios.get(remotePlayerId);
    if (!audio) return;
    audio.pause();
    audio.srcObject = null;
    audio.remove();
    this.remoteAudios.delete(remotePlayerId);
  }

  private logConnection(label: string, remotePlayerId: string, peer: RTCPeerConnection): void {
    console.log(label, {
      playerId: this.playerId,
      remotePlayerId,
      connectionState: peer.connectionState,
      iceConnectionState: peer.iceConnectionState,
      signalingState: peer.signalingState,
    });
  }
}

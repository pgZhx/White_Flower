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
  remoteTracks: Set<MediaStreamTrack>;
  makingOffer: boolean;
  connectedAt: number;
  lastInboundBytes: number | null;
  lastInboundProgressAt: number;
  lastOutboundBytes: number | null;
  lastOutboundProgressAt: number;
}

export interface VoiceRoomOptions {
  rtcConfiguration?: RTCConfiguration;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
}

const DEFAULT_RECONNECT_BASE_DELAY_MS = 1000;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 15000;
const MEDIA_HEALTH_INTERVAL_MS = 5000;
const MEDIA_STALL_TIMEOUT_MS = 15000;

export class VoiceRoom {
  private readonly connections = new Map<string, VoiceConnection>();
  private readonly participants = new Set<string>();
  private readonly remoteStreams = new Map<string, MediaStream>();
  private readonly remoteAudios = new Map<string, HTMLAudioElement>();
  private readonly reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly reconnectAttempts = new Map<string, number>();
  private readonly remoteMuteTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly unsubSignal: () => void;
  private readonly unsubManager: () => void;
  private readonly rtcConfiguration: RTCConfiguration;
  private readonly reconnectBaseDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly healthTimer: ReturnType<typeof setInterval>;
  private healthCheckRunning = false;
  private readonly unlockAudio = (): void => {
    for (const audio of this.remoteAudios.values()) {
      void this.playRemoteAudio(audio);
    }
    void this.checkMediaHealth();
  };
  private readonly handleVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') this.unlockAudio();
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
    this.unsubManager = manager.subscribe(() => this.syncLocalAudioTrack());
    this.healthTimer = setInterval(() => void this.checkMediaHealth(), MEDIA_HEALTH_INTERVAL_MS);
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', this.unlockAudio, { passive: true });
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  restartConnections(reason = 'voice connection refresh requested'): void {
    if (this.destroyed) return;
    for (const remotePlayerId of this.participants) {
      this.clearReconnect(remotePlayerId, false);
      this.scheduleReconnect(remotePlayerId, reason, 0);
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
    this.unsubManager();
    clearInterval(this.healthTimer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', this.unlockAudio);
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    for (const id of this.connections.keys()) this.closeConnection(id);
    for (const timer of this.reconnectTimers.values()) clearTimeout(timer);
    for (const timer of this.remoteMuteTimers.values()) clearTimeout(timer);
    this.connections.clear();
    this.participants.clear();
    this.remoteStreams.clear();
    this.remoteAudios.clear();
    this.reconnectTimers.clear();
    this.reconnectAttempts.clear();
    this.remoteMuteTimers.clear();
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
      remoteTracks: new Set(),
      makingOffer: false,
      connectedAt: Date.now(),
      lastInboundBytes: null,
      lastInboundProgressAt: Date.now(),
      lastOutboundBytes: null,
      lastOutboundProgressAt: Date.now(),
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
      if (this.connections.get(remotePlayerId)?.peer !== peer) return;
      const remoteStream = event.streams[0] ?? new MediaStream([event.track]);
      this.watchRemoteTrack(remotePlayerId, connection, event.track);
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
        connection.connectedAt = Date.now();
        connection.lastInboundProgressAt = connection.connectedAt;
        connection.lastOutboundProgressAt = connection.connectedAt;
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

  private syncLocalAudioTrack(): void {
    const stream = this.manager.localStream;
    const track = stream?.getAudioTracks().find((item) => item.readyState === 'live');
    if (!stream || !track) return;

    for (const [remotePlayerId, connection] of this.connections) {
      const sender = connection.peer.getSenders().find((item) => item.track?.kind === 'audio');
      if (sender?.track?.id === track.id) continue;
      if (!sender) {
        connection.peer.addTrack(track, stream);
        connection.localAudioTrackIds = new Set([track.id]);
        if (this.playerId < remotePlayerId) {
          void this.createOffer(remotePlayerId, connection);
        } else {
          this.sendSignal(remotePlayerId, { kind: 'RESTART' });
        }
        continue;
      }
      void sender.replaceTrack(track).then(() => {
        connection.localAudioTrackIds = new Set([track.id]);
        connection.lastOutboundBytes = null;
        connection.lastOutboundProgressAt = Date.now();
        console.log('[voice] replaced ended local microphone track', {
          playerId: this.playerId,
          remotePlayerId,
          trackId: track.id,
        });
      }).catch((error) => {
        console.warn('[voice] failed to replace local microphone track', {
          playerId: this.playerId,
          remotePlayerId,
          error,
        });
        this.scheduleReconnect(remotePlayerId, 'local microphone replacement failed', 250);
      });
    }
  }

  private watchRemoteTrack(
    remotePlayerId: string,
    connection: VoiceConnection,
    track: MediaStreamTrack,
  ): void {
    connection.remoteTracks.add(track);
    const timerKey = `${remotePlayerId}:${track.id}`;
    track.onended = () => {
      this.clearRemoteMuteTimer(timerKey);
      if (this.connections.get(remotePlayerId) === connection) {
        this.scheduleReconnect(remotePlayerId, 'remote audio track ended', 250);
      }
    };
    track.onmute = () => {
      this.clearRemoteMuteTimer(timerKey);
      const timer = setTimeout(() => {
        this.remoteMuteTimers.delete(timerKey);
        if (track.muted && track.readyState === 'live' && this.connections.get(remotePlayerId) === connection) {
          this.scheduleReconnect(remotePlayerId, 'remote audio track stayed muted');
        }
      }, MEDIA_STALL_TIMEOUT_MS);
      this.remoteMuteTimers.set(timerKey, timer);
    };
    track.onunmute = () => {
      this.clearRemoteMuteTimer(timerKey);
      connection.lastInboundProgressAt = Date.now();
    };
  }

  private clearRemoteMuteTimer(timerKey: string): void {
    const timer = this.remoteMuteTimers.get(timerKey);
    if (timer) clearTimeout(timer);
    this.remoteMuteTimers.delete(timerKey);
  }

  private async checkMediaHealth(): Promise<void> {
    if (this.destroyed || this.healthCheckRunning) return;
    this.healthCheckRunning = true;
    try {
      for (const audio of this.remoteAudios.values()) {
        if (audio.paused && (typeof document === 'undefined' || document.visibilityState === 'visible')) {
          void this.playRemoteAudio(audio);
        }
      }
      await Promise.all([...this.connections].map(([remotePlayerId, connection]) => (
        this.checkConnectionMedia(remotePlayerId, connection)
      )));
    } finally {
      this.healthCheckRunning = false;
    }
  }

  private async checkConnectionMedia(remotePlayerId: string, connection: VoiceConnection): Promise<void> {
    const peer = connection.peer;
    if (
      this.connections.get(remotePlayerId) !== connection
      || peer.connectionState !== 'connected'
      || typeof peer.getStats !== 'function'
    ) return;

    try {
      const stats = await peer.getStats();
      let inboundBytes = 0;
      let outboundBytes = 0;
      let inboundAudioFound = false;
      let outboundAudioFound = false;
      stats.forEach((report) => {
        const item = report as RTCStats & {
          kind?: string;
          mediaType?: string;
          bytesReceived?: number;
          bytesSent?: number;
          isRemote?: boolean;
        };
        const isAudio = item.kind === 'audio' || item.mediaType === 'audio';
        if (!isAudio || item.isRemote) return;
        if (item.type === 'inbound-rtp') {
          inboundAudioFound = true;
          inboundBytes += item.bytesReceived ?? 0;
        } else if (item.type === 'outbound-rtp') {
          outboundAudioFound = true;
          outboundBytes += item.bytesSent ?? 0;
        }
      });

      const now = Date.now();
      if (inboundAudioFound && (connection.lastInboundBytes === null || inboundBytes > connection.lastInboundBytes)) {
        connection.lastInboundProgressAt = now;
      }
      connection.lastInboundBytes = inboundAudioFound ? inboundBytes : connection.lastInboundBytes;

      if (
        now - connection.connectedAt >= MEDIA_STALL_TIMEOUT_MS
        && now - connection.lastInboundProgressAt >= MEDIA_STALL_TIMEOUT_MS
      ) {
        this.scheduleReconnect(remotePlayerId, 'inbound audio stopped progressing');
        return;
      }

      if (!this.manager.isEffectivelyEnabled) {
        connection.lastOutboundBytes = null;
        connection.lastOutboundProgressAt = now;
        return;
      }
      if (outboundAudioFound && (connection.lastOutboundBytes === null || outboundBytes > connection.lastOutboundBytes)) {
        connection.lastOutboundProgressAt = now;
      }
      connection.lastOutboundBytes = outboundAudioFound ? outboundBytes : connection.lastOutboundBytes;
      if (
        now - connection.connectedAt >= MEDIA_STALL_TIMEOUT_MS
        && now - connection.lastOutboundProgressAt >= MEDIA_STALL_TIMEOUT_MS
      ) {
        await this.manager.ensureLiveMicrophone();
        this.scheduleReconnect(remotePlayerId, 'outbound audio stopped progressing');
      }
    } catch (error) {
      console.warn('[voice] failed to inspect WebRTC audio statistics', {
        playerId: this.playerId,
        remotePlayerId,
        error,
      });
    }
  }

  private attachAudio(remotePlayerId: string, stream: MediaStream): void {
    const connection = this.connections.get(remotePlayerId);
    if (!connection || typeof Audio === 'undefined') return;
    this.remoteStreams.set(remotePlayerId, stream);
    this.stopRemoteAudio(remotePlayerId);
    const audio = new Audio();
    audio.autoplay = true;
    audio.muted = false;
    audio.volume = 1;
    audio.srcObject = stream;
    audio.setAttribute('playsinline', '');
    audio.setAttribute('aria-hidden', 'true');
    audio.style.display = 'none';
    if (typeof document !== 'undefined') document.body.appendChild(audio);
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
    for (const track of connection.remoteTracks) {
      this.clearRemoteMuteTimer(`${remotePlayerId}:${track.id}`);
      track.onended = null;
      track.onmute = null;
      track.onunmute = null;
    }
    connection.remoteTracks.clear();
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

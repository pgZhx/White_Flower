import type {
  GameCommandMessage,
  HostDisconnectedMessage,
  HostErrorMessage,
  JoinAccepted,
  JoinRequest,
  LobbySnapshot,
  MultiplayerTransport,
  NetworkMessage,
  PlayerViewMessage,
  ReadyCommand,
  VoiceSignalMessage,
  VoiceStatusMessage,
} from '@rose-blade/p2p-network';
import { createMessage, makeSessionId } from '@rose-blade/p2p-network';
import type { ClientView } from '@rose-blade/game-engine';
import type { GameCommand } from '../game/HostGameController';
import type { VoiceSignal } from '../voice/VoiceRoom';

export interface NetworkPeerState {
  playerId: string | null;
  room: LobbySnapshot['payload']['roomState'] | null;
  view: ClientView | null;
  lastError: string | null;
  voiceStatuses: Record<string, boolean>;
}

export type PeerCommand = Omit<GameCommand, 'playerId'>;
const MAX_PENDING_VOICE_SIGNALS = 256;

interface PendingVoiceSignal {
  fromPlayerId: string;
  toPlayerId: string;
  signal: VoiceSignal;
}

export class NetworkPeer {
  state: NetworkPeerState = {
    playerId: null,
    room: null,
    view: null,
    lastError: null,
    voiceStatuses: {},
  };

  private listeners = new Set<() => void>();
  private voiceStatusHandlers = new Set<(playerId: string, enabled: boolean) => void>();
  private voiceSignalHandlers = new Set<(fromPlayerId: string, signal: VoiceSignal) => void>();
  private pendingVoiceSignals: PendingVoiceSignal[] = [];
  private readonly _sessionId: string;

  get sessionId(): string {
    return this._sessionId;
  }

  constructor(
    private readonly transport: MultiplayerTransport,
    private readonly peerId: string,
  ) {
    this._sessionId = makeSessionId();
    this.transport.onMessage((message) => this.handleMessage(message));
    this.transport.onPeerDisconnected(() => {
      this.state = {
        ...this.state,
        lastError: '房主已离开。当前对局无法继续。',
      };
      this.emit();
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  join(roomId: string, nickname: string, playerId?: string): void {
    const message = createMessage<JoinRequest>('JOIN_REQUEST', {
      roomId,
      nickname,
      ...(playerId ? { playerId } : {}),
      sessionId: this.sessionId,
    });
    this.transport.send(message);
  }

  async reconnect(roomId: string, nickname: string, playerId?: string): Promise<void> {
    if (this.transport.reconnect) {
      await this.transport.reconnect();
    }
    this.state = {
      playerId: null,
      room: null,
      view: null,
      lastError: null,
      voiceStatuses: {},
    };
    this.pendingVoiceSignals = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('重连超时，请检查网络后重试。'));
      }, 12000);

      const cleanup = () => {
        clearTimeout(timer);
        unsub();
      };

      const unsub = this.subscribe(() => {
        if (this.state.playerId) {
          cleanup();
          resolve();
        } else if (this.state.lastError) {
          cleanup();
          reject(new Error(this.state.lastError));
        }
      });

      this.join(roomId, nickname, playerId);
    });
  }

  setReady(ready: boolean): void {
    const message = createMessage<ReadyCommand>('READY_COMMAND', {
      ...(this.state.room ? { roomId: this.state.room.roomId } : {}),
      sessionId: this.sessionId,
      ready,
    });
    this.transport.send(message);
  }

  sendCommand(command: PeerCommand): void {
    if (!this.state.playerId) return;
    const message = createMessage<GameCommandMessage>('GAME_COMMAND', {
      ...(this.state.room ? { roomId: this.state.room.roomId } : {}),
      sessionId: this.sessionId,
      payload: command,
    });
    this.transport.send(message);
  }

  sendVoiceSignal(toPlayerId: string, signal: VoiceSignal): void {
    const message = createMessage<VoiceSignalMessage>('VOICE_SIGNAL', {
      ...(this.state.room ? { roomId: this.state.room.roomId } : {}),
      sessionId: this._sessionId,
      payload: { fromPlayerId: this.state.playerId ?? '', toPlayerId, signal },
    });
    this.transport.send(message);
  }

  onVoiceSignal(handler: (fromPlayerId: string, signal: VoiceSignal) => void): () => void {
    this.voiceSignalHandlers.add(handler);
    const pending = this.pendingVoiceSignals.splice(0);
    for (const message of pending) {
      if (message.toPlayerId === this.state.playerId) {
        handler(message.fromPlayerId, message.signal);
      }
    }
    return () => this.voiceSignalHandlers.delete(handler);
  }

  sendVoiceStatus(enabled: boolean): void {
    const message = createMessage<VoiceStatusMessage>('VOICE_STATUS', {
      ...(this.state.room ? { roomId: this.state.room.roomId } : {}),
      sessionId: this._sessionId,
      payload: { playerId: this.state.playerId ?? '', enabled },
    });
    this.transport.send(message);
  }

  onVoiceStatus(handler: (playerId: string, enabled: boolean) => void): () => void {
    this.voiceStatusHandlers.add(handler);
    return () => this.voiceStatusHandlers.delete(handler);
  }

  disconnect(): void {
    this.transport.disconnect();
  }

  private handleMessage(message: NetworkMessage): void {
    if (message.type === 'JOIN_ACCEPTED') {
      const accepted = message as JoinAccepted;
      this.state = {
        ...this.state,
        playerId: accepted.payload.playerId,
        room: accepted.payload.roomState,
        lastError: null,
      };
      this.emit();
      return;
    }
    if (message.type === 'JOIN_REJECTED') {
      this.state = {
        ...this.state,
        lastError: message.payload.reason,
      };
      this.emit();
      return;
    }
    if (message.type === 'LOBBY_SNAPSHOT') {
      const snapshot = message as LobbySnapshot;
      this.state = {
        ...this.state,
        room: snapshot.payload.roomState,
        view: snapshot.payload.roomState.status === 'LOBBY' ? null : this.state.view,
      };
      this.emit();
      return;
    }
    if (message.type === 'PLAYER_VIEW') {
      const viewMessage = message as PlayerViewMessage;
      this.state = {
        ...this.state,
        view: viewMessage.payload.view as ClientView,
      };
      this.emit();
      return;
    }
    if (message.type === 'VOICE_SIGNAL') {
      const { fromPlayerId, toPlayerId, signal } = message.payload;
      if (this.state.playerId && toPlayerId !== this.state.playerId) return;
      if (!this.state.playerId || this.voiceSignalHandlers.size === 0) {
        if (this.pendingVoiceSignals.length >= MAX_PENDING_VOICE_SIGNALS) {
          this.pendingVoiceSignals.shift();
        }
        this.pendingVoiceSignals.push({
          fromPlayerId,
          toPlayerId,
          signal: signal as VoiceSignal,
        });
        return;
      }
      for (const handler of this.voiceSignalHandlers) {
        handler(fromPlayerId, signal as VoiceSignal);
      }
      return;
    }
    if (message.type === 'VOICE_STATUS') {
      const { playerId, enabled } = message.payload;
      this.state = { ...this.state, voiceStatuses: { ...this.state.voiceStatuses, [playerId]: enabled } };
      for (const handler of this.voiceStatusHandlers) handler(playerId, enabled);
      this.emit();
      return;
    }
    if (message.type === 'HOST_ERROR') {
      const errorMessage = message as HostErrorMessage;
      this.state = {
        ...this.state,
        lastError: errorMessage.payload.message,
      };
      this.emit();
    }
    if (message.type === 'HOST_DISCONNECTED') {
      const hostLeft = message as HostDisconnectedMessage;
      this.state = {
        ...this.state,
        lastError: hostLeft.payload.message,
      };
      this.emit();
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

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
} from '@rose-blade/p2p-network';
import { createMessage, makeSessionId } from '@rose-blade/p2p-network';
import type { ClientView } from '@rose-blade/game-engine';
import type { GameCommand } from '../game/HostGameController';

export interface NetworkPeerState {
  playerId: string | null;
  room: LobbySnapshot['payload']['roomState'] | null;
  view: ClientView | null;
  lastError: string | null;
}

export type PeerCommand = Omit<GameCommand, 'playerId'>;

export class NetworkPeer {
  state: NetworkPeerState = {
    playerId: null,
    room: null,
    view: null,
    lastError: null,
  };

  private listeners = new Set<() => void>();
  private readonly sessionId: string;

  constructor(
    private readonly transport: MultiplayerTransport,
    private readonly peerId: string,
  ) {
    this.sessionId = makeSessionId();
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

  join(roomId: string, nickname: string): void {
    const message = createMessage<JoinRequest>('JOIN_REQUEST', {
      roomId,
      nickname,
      sessionId: this.sessionId,
    });
    this.transport.send(message);
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

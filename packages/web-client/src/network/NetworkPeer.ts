import type {
  GameCommandMessage,
  JoinAccepted,
  JoinRequest,
  LobbySnapshot,
  MultiplayerTransport,
  NetworkMessage,
  PlayerViewMessage,
} from '@rose-blade/p2p-network';
import { createMessage } from '@rose-blade/p2p-network';
import type { ClientView } from '@rose-blade/game-engine';
import type { GameCommand } from '../game/HostGameController';

export interface NetworkPeerState {
  playerId: string | null;
  room: LobbySnapshot['payload']['roomState'] | null;
  view: ClientView | null;
  lastError: string | null;
}

export class NetworkPeer {
  state: NetworkPeerState = {
    playerId: null,
    room: null,
    view: null,
    lastError: null,
  };

  private listeners = new Set<() => void>();

  constructor(
    private readonly transport: MultiplayerTransport,
    private readonly peerId: string,
  ) {
    this.transport.onMessage((message) => this.handleMessage(message));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  join(roomId: string, nickname: string): void {
    const message = createMessage<JoinRequest>('JOIN_REQUEST', {
      playerId: this.peerId,
      roomId,
      nickname,
    });
    this.transport.send(message);
  }

  sendCommand(command: GameCommand): void {
    if (!this.state.playerId) return;
    const message = createMessage<GameCommandMessage>('GAME_COMMAND', {
      playerId: this.state.playerId,
      payload: command,
    });
    this.transport.send(message);
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
      this.state = {
        ...this.state,
        lastError: message.payload.message,
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

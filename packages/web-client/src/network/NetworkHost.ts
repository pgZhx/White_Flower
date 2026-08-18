import type {
  GameCommandMessage,
  HostErrorMessage,
  JoinAccepted,
  JoinRejected,
  JoinRequest,
  LobbySnapshot,
  MultiplayerTransport,
  NetworkMessage,
  PlayerViewMessage,
} from '@rose-blade/p2p-network';
import { createMessage } from '@rose-blade/p2p-network';
import { HostGameController, type GameCommand } from '../game/HostGameController';

export class NetworkHost {
  constructor(
    readonly controller: HostGameController,
    private readonly transport: MultiplayerTransport,
  ) {
    this.transport.onMessage((message) => this.handleMessage(message));
    this.controller.subscribe(() => this.broadcastViews());
  }

  private handleMessage(message: NetworkMessage): void {
    if (message.type === 'JOIN_REQUEST') {
      this.handleJoin(message);
      return;
    }
    if (message.type === 'GAME_COMMAND') {
      this.handleCommand(message);
    }
  }

  private handleJoin(message: JoinRequest): void {
    if (!message.playerId) return;
    if (this.controller.room.players.length >= 10) {
      this.transport.sendTo(message.playerId, createMessage<JoinRejected>('JOIN_REJECTED', {
        payload: { reason: '房间已满' },
      }));
      return;
    }
    this.controller.addPlayer(message.nickname);
    const player = this.controller.room.players[this.controller.room.players.length - 1]!;
    this.transport.sendTo(message.playerId, createMessage<JoinAccepted>('JOIN_ACCEPTED', {
      playerId: player.id,
      payload: {
        playerId: player.id,
        hostPlayerId: this.controller.hostPlayerId,
        roomState: this.controller.room,
      },
    }));
    this.broadcastLobby();
  }

  private handleCommand(message: GameCommandMessage): void {
    const command = message.payload as GameCommand;
    try {
      this.controller.handleCommand(command);
    } catch (error) {
      const err = error instanceof Error ? error.message : '未知错误';
      if (message.playerId) {
        this.transport.sendTo(message.playerId, createMessage<HostErrorMessage>('HOST_ERROR', {
          payload: { code: 'COMMAND_REJECTED', message: err },
        }));
      }
    }
  }

  private broadcastLobby(): void {
    const message = createMessage<LobbySnapshot>('LOBBY_SNAPSHOT', {
      payload: { roomState: this.controller.room },
    });
    for (const player of this.controller.room.players) {
      if (player.id === this.controller.hostPlayerId) continue;
      this.transport.sendTo(player.id, message);
    }
  }

  private broadcastViews(): void {
    for (const player of this.controller.room.players) {
      const view = this.controller.getView(player.id);
      if (!view) continue;
      const message = createMessage<PlayerViewMessage>('PLAYER_VIEW', {
        playerId: player.id,
        payload: { view, phase: view.phase },
      });
      if (player.id === this.controller.hostPlayerId) continue;
      this.transport.sendTo(player.id, message);
    }
  }
}

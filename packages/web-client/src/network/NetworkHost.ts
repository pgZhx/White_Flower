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
  ReadyCommand,
} from '@rose-blade/p2p-network';
import { createMessage, makePlayerId } from '@rose-blade/p2p-network';
import { HostGameController, type GameCommand } from '../game/HostGameController';

const NICKNAME_PATTERN = /^[^\s]{1,16}$/;

export class NetworkHost {
  private readonly peerToPlayer = new Map<string, string>();
  private readonly playerToPeer = new Map<string, string>();
  private readonly peerSessions = new Map<string, string>();
  private readonly unsubscribers: Array<() => void> = [];
  private destroyed = false;

  constructor(
    readonly controller: HostGameController,
    private readonly transport: MultiplayerTransport,
  ) {
    this.unsubscribers.push(
      this.transport.onMessage((message, fromPeerId) => this.handleMessage(message, fromPeerId)),
      this.transport.onPeerDisconnected((peerId) => this.handlePeerDisconnected(peerId)),
      this.controller.subscribe(() => this.broadcastAll()),
    );
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.peerToPlayer.clear();
    this.playerToPeer.clear();
    this.peerSessions.clear();
  }

  private handleMessage(message: NetworkMessage, fromPeerId?: string): void {
    if (this.destroyed) return;
    switch (message.type) {
      case 'JOIN_REQUEST':
        this.handleJoin(message, fromPeerId);
        return;
      case 'READY_COMMAND':
        this.handleReady(message, fromPeerId);
        return;
      case 'GAME_COMMAND':
        this.handleCommand(message, fromPeerId);
        return;
      default:
        break;
    }
  }

  private handleJoin(message: JoinRequest, fromPeerId?: string): void {
    const peerId = fromPeerId ?? message.playerId ?? message.sessionId;
    if (!peerId) {
      this.sendError(peerId ?? '', 'PROTOCOL_MISMATCH', '缺少 Peer 标识');
      return;
    }
    if (this.peerToPlayer.has(peerId)) {
      this.sendError(peerId, 'ALREADY_JOINED', '你已经在该房间中');
      return;
    }
    if (this.controller.room.status !== 'LOBBY') {
      this.sendError(peerId, 'GAME_ALREADY_STARTED', '游戏已经开始，无法加入');
      return;
    }
    if (this.controller.room.players.length >= 10) {
      this.sendError(peerId, 'ROOM_FULL', '房间已满');
      return;
    }
    const nickname = message.nickname?.trim();
    if (!nickname || !NICKNAME_PATTERN.test(nickname)) {
      this.sendError(peerId, 'INVALID_NICKNAME', '昵称不合法（1-16 位且不含空格）');
      return;
    }
    if (this.controller.room.players.some((p) => p.nickname.toLowerCase() === nickname.toLowerCase())) {
      this.sendError(peerId, 'DUPLICATE_NICKNAME', '昵称已被使用');
      return;
    }

    const playerId = makePlayerId();
    this.peerToPlayer.set(peerId, playerId);
    this.playerToPeer.set(playerId, peerId);
    if (message.sessionId) this.peerSessions.set(peerId, message.sessionId);

    this.controller.addPlayer(nickname, playerId);

    const accepted = createMessage<JoinAccepted>('JOIN_ACCEPTED', {
      playerId,
      payload: {
        playerId,
        hostPlayerId: this.controller.hostPlayerId,
        roomState: this.controller.room,
      },
    });
    this.transport.sendTo(peerId, accepted);
    this.broadcastLobby();
  }

  private handleReady(message: ReadyCommand, fromPeerId?: string): void {
    const peerId = fromPeerId ?? message.sessionId;
    const playerId = peerId ? this.peerToPlayer.get(peerId) : undefined;
    if (!playerId) {
      this.sendError(fromPeerId ?? '', 'UNKNOWN_PLAYER', '尚未加入房间');
      return;
    }
    this.controller.setReady(playerId, message.ready);
    this.broadcastLobby();
  }

  private handleCommand(message: GameCommandMessage, fromPeerId?: string): void {
    const peerId = fromPeerId ?? message.sessionId;
    const playerId = peerId ? this.peerToPlayer.get(peerId) : undefined;
    if (!playerId) {
      this.sendError(fromPeerId ?? '', 'UNKNOWN_PLAYER', '尚未加入房间');
      return;
    }

    const raw = message.payload as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object' || typeof raw.type !== 'string') {
      this.sendError(fromPeerId!, 'INVALID_COMMAND', '无效命令');
      return;
    }

    // Never trust a player-supplied playerId. The real actor is resolved from the connection.
    if (raw.type === 'START_GAME' && playerId !== this.controller.hostPlayerId) {
      this.sendError(fromPeerId!, 'HOST_ONLY', '只有房主可以开始游戏');
      return;
    }
    const { playerId: _ignored, ...clean } = raw;
    const command = { ...clean, playerId } as unknown as GameCommand;
    try {
      this.controller.handleCommand(command);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '未知错误';
      this.sendError(fromPeerId!, 'COMMAND_REJECTED', messageText);
    }
  }

  private handlePeerDisconnected(peerId: string): void {
    const playerId = this.peerToPlayer.get(peerId);
    if (!playerId) return;

    this.peerToPlayer.delete(peerId);
    this.playerToPeer.delete(playerId);
    this.peerSessions.delete(peerId);

    if (this.controller.room.status === 'LOBBY') {
      this.controller.removePlayer(playerId);
    } else {
      this.controller.setPlayerConnected(playerId, false);
    }
    this.broadcastAll();
  }

  private broadcastAll(): void {
    if (this.destroyed) return;
    if (this.controller.room.status === 'LOBBY') {
      this.broadcastLobby();
    } else {
      this.broadcastViews();
    }
  }

  private broadcastLobby(): void {
    const message = createMessage<LobbySnapshot>('LOBBY_SNAPSHOT', {
      payload: { roomState: this.controller.room },
    });
    for (const player of this.controller.room.players) {
      if (player.id === this.controller.hostPlayerId) continue;
      const peerId = this.playerToPeer.get(player.id);
      if (peerId) {
        this.transport.sendTo(peerId, message);
      }
    }
  }

  private broadcastViews(): void {
    for (const player of this.controller.room.players) {
      if (player.id === this.controller.hostPlayerId) continue;
      const view = this.controller.getView(player.id);
      if (!view) continue;
      const message = createMessage<PlayerViewMessage>('PLAYER_VIEW', {
        playerId: player.id,
        payload: { view, phase: view.phase },
      });
      const peerId = this.playerToPeer.get(player.id);
      if (peerId) {
        this.transport.sendTo(peerId, message);
      }
    }
  }

  private sendError(peerId: string, code: string, message: string): void {
    if (!peerId) return;
    try {
      this.transport.sendTo(peerId, createMessage<HostErrorMessage>('HOST_ERROR', {
        payload: { code, message },
      }));
    } catch {
      // Peer may already be gone.
    }
  }
}

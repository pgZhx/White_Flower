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
  private readonly disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly unsubscribers: Array<() => void> = [];
  private destroyed = false;

  constructor(
    readonly controller: HostGameController,
    private readonly transport: MultiplayerTransport,
  ) {
    this.unsubscribers.push(
      this.transport.onMessage((message, fromPeerId) => this.handleMessage(message, fromPeerId)),
      this.transport.onPeerConnected((peerId) => this.handlePeerConnected(peerId)),
      this.transport.onPeerDisconnected((peerId) => this.handlePeerDisconnected(peerId)),
      this.controller.subscribe(() => this.broadcastAll()),
    );
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
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
    if (this.controller.room.players.length >= 10) {
      this.sendError(peerId, 'ROOM_FULL', '房间已满');
      return;
    }
    const nickname = message.nickname?.trim();
    if (!nickname || !NICKNAME_PATTERN.test(nickname)) {
      this.sendError(peerId, 'INVALID_NICKNAME', '昵称不合法（1-16 位且不含空格）');
      return;
    }

    const existingPlayerId = this.peerToPlayer.get(peerId);
    if (existingPlayerId) {
      // This is a reconnect (e.g. page refresh or temporary network drop).
      // The player's identity is already known, so re-accept without creating a duplicate.
      if (message.sessionId) this.peerSessions.set(peerId, message.sessionId);
      const player = this.controller.room.players.find((p) => p.id === existingPlayerId);
      if (player && player.nickname.toLowerCase() === nickname.toLowerCase()) {
        const timer = this.disconnectTimers.get(peerId);
        if (timer) {
          clearTimeout(timer);
          this.disconnectTimers.delete(peerId);
        }
        this.controller.setPlayerConnected(existingPlayerId, true);
        const accepted = createMessage<JoinAccepted>('JOIN_ACCEPTED', {
          playerId: existingPlayerId,
          payload: {
            playerId: existingPlayerId,
            hostPlayerId: this.controller.hostPlayerId,
            roomState: this.controller.room,
          },
        });
        this.transport.sendTo(peerId, accepted);
        this.broadcastAll();
        return;
      }

      // Same browser/connection is trying to use a different nickname.
      if (this.controller.room.status !== 'LOBBY') {
        this.sendError(peerId, 'SESSION_MISMATCH', '游戏中不能更换昵称，请用原来的昵称刷新重连。');
        return;
      }

      // In the lobby we allow the same browser to switch nickname: drop the old
      // seat and continue as a fresh join.
      const timer = this.disconnectTimers.get(peerId);
      if (timer) {
        clearTimeout(timer);
        this.disconnectTimers.delete(peerId);
      }
      this.controller.removePlayer(existingPlayerId);
      this.peerToPlayer.delete(peerId);
      this.playerToPeer.delete(existingPlayerId);
      this.peerSessions.delete(peerId);
    }

    // If a returning player supplies their old playerId (stored locally before a
    // refresh), let them back into the same seat even after the host has reloaded.
    const reconnectingPlayer = message.playerId
      ? this.controller.room.players.find(
          (p) => p.id === message.playerId && p.nickname.toLowerCase() === nickname.toLowerCase(),
        )
      : undefined;
    if (reconnectingPlayer) {
      const timer = this.disconnectTimers.get(peerId);
      if (timer) {
        clearTimeout(timer);
        this.disconnectTimers.delete(peerId);
      }
      this.peerToPlayer.set(peerId, reconnectingPlayer.id);
      this.playerToPeer.set(reconnectingPlayer.id, peerId);
      if (message.sessionId) this.peerSessions.set(peerId, message.sessionId);
      this.controller.setPlayerConnected(reconnectingPlayer.id, true);
      const accepted = createMessage<JoinAccepted>('JOIN_ACCEPTED', {
        playerId: reconnectingPlayer.id,
        payload: {
          playerId: reconnectingPlayer.id,
          hostPlayerId: this.controller.hostPlayerId,
          roomState: this.controller.room,
        },
      });
      this.transport.sendTo(peerId, accepted);
      this.broadcastAll();
      return;
    }

    if (this.controller.room.players.some((p) => p.nickname.toLowerCase() === nickname.toLowerCase())) {
      this.sendError(peerId, 'DUPLICATE_NICKNAME', '昵称已被使用');
      return;
    }
    if (this.controller.room.status !== 'LOBBY') {
      this.sendError(peerId, 'GAME_ALREADY_STARTED', '游戏已经开始，无法加入');
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

    // Keep the peer->player mapping so the same browser can reconnect after a
    // temporary drop or page refresh. The UI marks the player as disconnected.
    this.peerSessions.delete(peerId);
    this.controller.setPlayerConnected(playerId, false);
    this.broadcastAll();

    // In the lobby, clean up players who never come back after a grace period.
    if (this.controller.room.status === 'LOBBY') {
      const timer = setTimeout(() => {
        this.disconnectTimers.delete(peerId);
        const player = this.controller.room.players.find((p) => p.id === playerId);
        if (!player || player.connected) return;
        this.controller.removePlayer(playerId);
        this.peerToPlayer.delete(peerId);
        this.playerToPeer.delete(playerId);
        this.peerSessions.delete(peerId);
        this.broadcastAll();
      }, 60_000);
      this.disconnectTimers.set(peerId, timer);
    }
  }

  private handlePeerConnected(peerId: string): void {
    const playerId = this.peerToPlayer.get(peerId);
    if (!playerId) return;
    const timer = this.disconnectTimers.get(peerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(peerId);
    }
    this.controller.setPlayerConnected(playerId, true);
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

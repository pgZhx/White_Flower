import {
  GameEngine,
  SeededRandom,
  buildPlayerView,
  createGame,
  type Card,
  type ClientView,
  type GameState,
} from '@rose-blade/game-engine';
import type { RoomPlayer, RoomState } from '@rose-blade/p2p-network';

export type GameCommand =
  | { type: 'READY'; playerId: string; ready: boolean }
  | { type: 'START_GAME'; playerId: string }
  | { type: 'CONFIRM_IDENTITY'; playerId: string }
  | { type: 'SELECT_COIN_TARGET'; playerId: string; targetId: string }
  | {
      type: 'RESOLVE_MAGIC';
      playerId: string;
      targetIds: string[];
      magic6Choice?: 'FIRST' | 'LAST';
    }
  | { type: 'PLAY_CARD'; playerId: string; card: Card }
  | { type: 'PASS'; playerId: string }
  | { type: 'MAGIC10_TARGET'; playerId: string; targetId: string | null }
  | { type: 'MAGIC10_REPLACEMENT'; playerId: string; replacementCard: Card }
  | { type: 'REVEAL'; playerId: string }
  | { type: 'RESOLVE_ROUND'; playerId: string }
  | { type: 'CHECK_VICTORY'; playerId: string };

export interface HostGameControllerOptions {
  roomId: string;
  hostPlayerId: string;
  seed?: number;
}

export class HostGameController {
  readonly roomId: string;
  readonly hostPlayerId: string;
  private seed: number;
  room: RoomState;
  private gameState: GameState | null = null;
  private engine: GameEngine | null = null;
  private identityConfirmed = new Set<string>();
  private listeners = new Set<() => void>();

  constructor(options: HostGameControllerOptions) {
    this.roomId = options.roomId;
    this.hostPlayerId = options.hostPlayerId;
    this.seed = options.seed ?? 20240818;
    this.room = {
      roomId: options.roomId,
      hostPlayerId: options.hostPlayerId,
      players: [],
      status: 'LOBBY',
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  addPlayer(nickname: string): RoomPlayer {
    const player: RoomPlayer = {
      id: `local_${this.room.players.length + 1}_${Date.now().toString(36)}`,
      nickname,
      seat: this.room.players.length,
      ready: false,
      connected: true,
      isHost: this.room.players.length === 0,
    };
    this.room = {
      ...this.room,
      players: [...this.room.players, player],
    };
    this.emit();
    return player;
  }

  addLocalPlayers(count: number): RoomPlayer[] {
    const names = ['你', 'Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Heidi', 'Ivan'];
    const players: RoomPlayer[] = [];
    for (let i = 0; i < count; i += 1) {
      players.push(this.addPlayer(names[i] ?? `Player${i + 1}`));
    }
    return players;
  }

  setReady(playerId: string, ready: boolean): void {
    this.room = {
      ...this.room,
      players: this.room.players.map((p) => (p.id === playerId ? { ...p, ready } : p)),
    };
    this.emit();
  }

  canStart(): boolean {
    return (
      this.room.players.length >= 5 &&
      this.room.players.length <= 10 &&
      this.room.players.every((p) => p.ready)
    );
  }

  startGame(): void {
    if (this.room.players.length < 5 || this.room.players.length > 10) {
      throw new Error('房间需要 5–10 名玩家');
    }
    if (!this.room.players.every((p) => p.ready)) {
      throw new Error('所有玩家必须准备');
    }
    const gameState = createGame(
      this.roomId,
      this.room.players.map((p) => ({ id: p.id, nickname: p.nickname })),
    );
    this.engine = new GameEngine(gameState);
    this.engine.startGame(new SeededRandom(this.seed));
    this.gameState = this.engine.getState();
    this.identityConfirmed.clear();
    this.room = { ...this.room, status: 'PLAYING' };
    this.emit();
  }

  confirmIdentity(playerId: string): void {
    if (!this.engine || !this.gameState) {
      throw new Error('游戏尚未开始');
    }
    this.identityConfirmed.add(playerId);
    if (this.identityConfirmed.size >= this.room.players.length) {
      this.engine.performNightRecognition();
      this.engine.performDoubleKnifeNight();
      this.gameState = this.engine.getState();
    }
    this.emit();
  }

  getView(playerId: string): ClientView | null {
    if (!this.engine || !this.gameState) {
      return null;
    }
    return buildPlayerView(this.gameState, playerId);
  }

  get hostView(): ClientView | null {
    return this.getView(this.hostPlayerId);
  }

  get phase(): GameState['phase'] | 'LOBBY' {
    if (!this.gameState) return 'LOBBY';
    return this.gameState.phase;
  }

  get isPlaying(): boolean {
    return this.gameState !== null;
  }

  get allIdentitiesConfirmed(): boolean {
    return this.room.players.length > 0 && this.identityConfirmed.size >= this.room.players.length;
  }

  handleCommand(command: GameCommand): void {
    if (!this.engine || !this.gameState) {
      if (command.type === 'READY') {
        this.setReady(command.playerId, command.ready);
        return;
      }
      if (command.type === 'START_GAME') {
        this.startGame();
        return;
      }
      throw new Error('游戏尚未开始');
    }

    switch (command.type) {
      case 'READY':
        this.setReady(command.playerId, command.ready);
        return;
      case 'START_GAME':
        this.startGame();
        return;
      case 'CONFIRM_IDENTITY':
        this.confirmIdentity(command.playerId);
        return;
      case 'SELECT_COIN_TARGET':
        this.engine.selectCoinTarget(command.targetId);
        break;
      case 'RESOLVE_MAGIC':
        this.engine.resolveMagic(command.targetIds, new SeededRandom(this.seed + this.gameState.roundNumber), command.magic6Choice);
        break;
      case 'PLAY_CARD':
        this.engine.submitPlayerAction(command.playerId, 'PLAY', command.card, new SeededRandom(this.seed + this.gameState.roundNumber));
        break;
      case 'PASS':
        this.engine.submitPlayerAction(command.playerId, 'PASS', null, new SeededRandom(this.seed + this.gameState.roundNumber));
        break;
      case 'MAGIC10_TARGET':
        this.engine.submitMagic10Target(command.playerId, command.targetId);
        break;
      case 'MAGIC10_REPLACEMENT':
        this.engine.submitMagic10Replacement(command.playerId, command.replacementCard);
        break;
      case 'REVEAL':
        this.engine.revealRound(new SeededRandom(this.seed + this.gameState.roundNumber));
        break;
      case 'RESOLVE_ROUND':
        this.engine.resolveRound();
        break;
      case 'CHECK_VICTORY':
        this.engine.checkVictoryAndAdvance();
        break;
    }

    this.gameState = this.engine.getState();
    this.emit();
  }
}

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

const PHASE_CONFIRMATION_REQUIRED = new Set<GameState['phase']>([
  'NIGHT_RECOGNITION',
  'NIGHT_DOUBLE_KNIFE',
  'ROUND_REVEAL',
  'ROUND_RESOLUTION',
  'CHECK_VICTORY',
]);

export type GameCommand =
  | { type: 'READY'; playerId: string; ready: boolean }
  | { type: 'START_GAME'; playerId: string }
  | { type: 'CONFIRM_IDENTITY'; playerId: string }
  | { type: 'SELECT_COIN_TARGET'; playerId: string; targetId: string }
  | { type: 'SELECT_SPEAKING_ORDER'; playerId: string; firstPlayerId: string; direction: 'CLOCKWISE' | 'COUNTERCLOCKWISE' }
  | { type: 'END_SPEAKING'; playerId: string }
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
  | { type: 'CHECK_VICTORY'; playerId: string }
  | { type: 'RESTART_GAME'; playerId: string }
  | { type: 'REMATCH'; playerId: string };

export interface HostGameControllerOptions {
  roomId: string;
  hostPlayerId: string;
  seed?: number;
}

export interface HostGameControllerSnapshot {
  version: 1;
  roomId: string;
  hostPlayerId: string;
  seed: number;
  room: RoomState;
  gameState: GameState | null;
  phaseConfirmations: Array<{ phase: GameState['phase']; playerIds: string[] }>;
  rematchPlayerIds?: string[];
}

export class HostGameController {
  readonly roomId: string;
  readonly hostPlayerId: string;
  private seed: number;
  room: RoomState;
  private gameState: GameState | null = null;
  private engine: GameEngine | null = null;
  private phaseConfirmations = new Map<string, Set<string>>();
  private rematchPlayerIds = new Set<string>();
  private voiceTimer: ReturnType<typeof setInterval> | null = null;
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
    this.syncVoiceTimer();
    for (const listener of this.listeners) {
      listener();
    }
  }

  notifyExternalChange(): void {
    this.emit();
  }

  destroy(): void {
    if (this.voiceTimer) {
      clearInterval(this.voiceTimer);
      this.voiceTimer = null;
    }
    this.listeners.clear();
  }

  addPlayer(nickname: string, playerId?: string): RoomPlayer {
    const isFirst = this.room.players.length === 0;
    const player: RoomPlayer = {
      id: playerId ?? (isFirst ? this.hostPlayerId : `local_${this.room.players.length + 1}_${Date.now().toString(36)}`),
      nickname,
      seat: this.room.players.length,
      ready: false,
      connected: true,
      isHost: isFirst,
    };
    this.room = {
      ...this.room,
      players: [...this.room.players, player],
    };
    this.emit();
    return player;
  }

  removePlayer(playerId: string): void {
    this.room = {
      ...this.room,
      players: this.room.players.filter((p) => p.id !== playerId),
    };
    this.emit();
  }

  setPlayerConnected(playerId: string, connected: boolean): void {
    this.room = {
      ...this.room,
      players: this.room.players.map((p) =>
        p.id === playerId ? { ...p, connected } : p,
      ),
    };
    this.skipDisconnectedSpeaker();
    this.tryStartRematch();
    this.emit();
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
    this.rematchPlayerIds.clear();
    this.phaseConfirmations.clear();
    this.room = { ...this.room, status: 'PLAYING' };
    this.emit();
  }

  confirmIdentity(playerId: string): void {
    if (!this.engine || !this.gameState) {
      throw new Error('游戏尚未开始');
    }
    const phase = this.gameState.phase;
    if (!PHASE_CONFIRMATION_REQUIRED.has(phase)) {
      return;
    }

    const set = this.confirmationSet(phase);
    set.add(playerId);

    const required = this.connectedPlayerCount();
    if (required > 0 && set.size >= required) {
      this.advanceAfterConfirmation(phase);
    }

    this.emit();
  }

  private connectedPlayerCount(): number {
    return this.room.players.filter((p) => p.connected).length;
  }

  private confirmationSet(phase: GameState['phase']): Set<string> {
    let set = this.phaseConfirmations.get(phase);
    if (!set) {
      set = new Set<string>();
      this.phaseConfirmations.set(phase, set);
    }
    return set;
  }

  private allConfirmedFor(phase: GameState['phase']): boolean {
    const required = this.connectedPlayerCount();
    return required > 0 && this.confirmationSet(phase).size >= required;
  }

  private advanceAfterConfirmation(phase: GameState['phase']): void {
    if (!this.engine || !this.gameState) {
      return;
    }
    switch (phase) {
      case 'NIGHT_RECOGNITION':
        this.engine.performNightRecognition();
        break;
      case 'NIGHT_DOUBLE_KNIFE':
        this.engine.performDoubleKnifeNight();
        break;
      case 'ROUND_REVEAL':
        this.engine.revealRound(new SeededRandom(this.seed + this.gameState.roundNumber));
        break;
      case 'ROUND_RESOLUTION':
        this.engine.resolveRound();
        break;
      case 'CHECK_VICTORY':
        this.engine.checkVictoryAndAdvance();
        break;
      default:
        return;
    }
    this.gameState = this.engine.getState();
    this.phaseConfirmations.delete(phase);
  }

  private syncVoiceTimer(): void {
    const timed = this.gameState?.phase === 'FIRST_SPEAKING_PHASE'
      || this.gameState?.phase === 'ROUND_SPEAKING_PHASE'
      || this.gameState?.phase === 'COIN_OWNER_SUMMARY_PHASE';
    if (timed && !this.voiceTimer) {
      this.voiceTimer = setInterval(() => this.tickVoice(), 1000);
    } else if (!timed && this.voiceTimer) {
      clearInterval(this.voiceTimer);
      this.voiceTimer = null;
    }
  }

  private tickVoice(): void {
    if (!this.engine || !this.gameState) return;
    try {
      this.engine.tickSpeaking();
      this.gameState = this.engine.getState();
      this.emit();
    } catch {
      this.syncVoiceTimer();
    }
  }

  private skipDisconnectedSpeaker(): void {
    if (!this.engine || !this.gameState) return;
    const currentSpeakerId = this.gameState.voice.currentSpeakerId;
    if (!currentSpeakerId) return;
    const currentPlayer = this.room.players.find((player) => player.id === currentSpeakerId);
    if (currentPlayer?.connected !== false) return;
    try {
      this.engine.endSpeaking(currentSpeakerId);
      this.gameState = this.engine.getState();
    } catch {
      // A simultaneous phase transition is resolved by the next state update.
    }
  }

  getView(playerId: string): ClientView | null {
    if (!this.engine || !this.gameState) {
      return null;
    }
    const view = buildPlayerView(this.gameState, playerId);
    return {
      ...view,
      phaseConfirmation: this.getPhaseConfirmation(playerId),
      rematchConfirmation: this.getRematchConfirmation(playerId),
    };
  }

  getPhaseConfirmation(viewerId: string): NonNullable<ClientView['phaseConfirmation']> | null {
    if (!this.gameState || !PHASE_CONFIRMATION_REQUIRED.has(this.gameState.phase)) {
      return null;
    }
    const phase = this.gameState.phase;
    const required = this.connectedPlayerCount();
    const set = this.phaseConfirmations.get(phase) ?? new Set<string>();
    return {
      required,
      confirmed: set.size,
      confirmedByMe: set.has(viewerId),
      allConfirmed: required > 0 && set.size >= required,
    };
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
    if (!this.gameState) return false;
    if (!PHASE_CONFIRMATION_REQUIRED.has(this.gameState.phase)) return true;
    return this.allConfirmedFor(this.gameState.phase);
  }

  get currentPlayerId(): string | null {
    if (!this.gameState?.round || this.gameState.phase !== 'PLAYER_ACTIONS') {
      return null;
    }
    return this.gameState.round.actionOrder[this.gameState.round.currentActionIndex] ?? null;
  }

  canPass(playerId: string): boolean {
    if (!this.gameState?.round || this.gameState.phase !== 'PLAYER_ACTIONS') {
      return false;
    }
    const round = this.gameState.round;
    const player = this.gameState.players.find((p) => p.id === playerId);
    if (!player) return false;
    if (round.forcedPlay.includes(playerId) && player.hand.length > 0) return false;
    if (
      (round.randomForcedLeft === playerId || round.randomForcedRight === playerId ||
        round.magic8Neighbors?.leftId === playerId || round.magic8Neighbors?.rightId === playerId) &&
      player.hand.length > 0
    ) {
      return false;
    }
    if (round.magic5Constraint?.laterId === playerId) {
      const earlier = round.actions[round.magic5Constraint.earlierId];
      return earlier?.type === 'PASS';
    }
    return true;
  }

  isRandomForced(playerId: string): boolean {
    if (!this.gameState?.round || this.gameState.phase !== 'PLAYER_ACTIONS') {
      return false;
    }
    const round = this.gameState.round;
    return (
      round.randomForcedLeft === playerId ||
      round.randomForcedRight === playerId
    );
  }

  getPendingMagic10() {
    return this.gameState?.round?.pendingMagic10 ?? null;
  }

  getGameOverSnapshot() {
    if (!this.gameState) return null;
    return {
      winner: this.gameState.winner,
      winReason: this.gameState.winReason,
      players: this.gameState.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        role: p.role,
        faction: p.faction,
        hand: [...p.hand],
      })),
    };
  }

  private connectedPlayers(): RoomPlayer[] {
    return this.room.players.filter((player) => player.connected);
  }

  private allRematchPlayersConfirmed(): boolean {
    const players = this.connectedPlayers();
    return players.length >= 5 && players.every((player) => this.rematchPlayerIds.has(player.id));
  }

  getRematchConfirmation(viewerId: string): NonNullable<ClientView['rematchConfirmation']> | null {
    if (!this.gameState || this.gameState.phase !== 'GAME_OVER') {
      return null;
    }
    const players = this.connectedPlayers();
    const confirmed = players.filter((player) => this.rematchPlayerIds.has(player.id)).length;
    return {
      required: players.length,
      confirmed,
      confirmedByMe: this.rematchPlayerIds.has(viewerId),
      allConfirmed: this.allRematchPlayersConfirmed(),
    };
  }

  private tryStartRematch(): void {
    if (!this.gameState || this.gameState.phase !== 'GAME_OVER' || !this.allRematchPlayersConfirmed()) {
      return;
    }

    const players = this.connectedPlayers();
    this.room = {
      ...this.room,
      players: players.map((player, index) => ({ ...player, seat: index, ready: true })),
    };
    this.gameState = null;
    this.engine = null;
    this.phaseConfirmations.clear();
    this.rematchPlayerIds.clear();
    this.seed = Date.now() + Math.floor(Math.random() * 100000);
    this.startGame();
  }

  restartGame(): void {
    this.gameState = null;
    this.engine = null;
    this.phaseConfirmations.clear();
    this.rematchPlayerIds.clear();
    this.room = {
      ...this.room,
      status: 'LOBBY',
      players: this.room.players.map((p) => ({ ...p, ready: false })),
    };
    this.emit();
  }

  rematch(playerId: string): void {
    if (!this.gameState || this.gameState.phase !== 'GAME_OVER') {
      throw new Error('只能在游戏结束后申请再来一局');
    }
    const player = this.room.players.find((item) => item.id === playerId);
    if (!player || !player.connected) {
      throw new Error('只有当前在线玩家可以申请再来一局');
    }

    this.rematchPlayerIds.add(playerId);
    this.tryStartRematch();
    this.emit();
  }

  snapshot(): HostGameControllerSnapshot {
    return {
      version: 1,
      roomId: this.roomId,
      hostPlayerId: this.hostPlayerId,
      seed: this.seed,
      room: this.room,
      gameState: this.gameState ? (JSON.parse(JSON.stringify(this.gameState)) as GameState) : null,
      phaseConfirmations: [...this.phaseConfirmations.entries()].map(([phase, ids]) => ({
        phase: phase as GameState['phase'],
        playerIds: [...ids],
      })),
      rematchPlayerIds: [...this.rematchPlayerIds],
    };
  }

  static fromSnapshot(snapshot: HostGameControllerSnapshot): HostGameController {
    const controller = new HostGameController({
      roomId: snapshot.roomId,
      hostPlayerId: snapshot.hostPlayerId,
      seed: snapshot.seed,
    });
    controller.room = snapshot.room;
    controller.gameState = snapshot.gameState ? (JSON.parse(JSON.stringify(snapshot.gameState)) as GameState) : null;
    controller.engine = controller.gameState ? new GameEngine(controller.gameState) : null;
    controller.phaseConfirmations = new Map(
      snapshot.phaseConfirmations.map((entry) => [entry.phase, new Set(entry.playerIds)]),
    );
    controller.rematchPlayerIds = new Set(snapshot.rematchPlayerIds ?? []);
    controller.syncVoiceTimer();
    return controller;
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
      if (command.type === 'RESTART_GAME') {
        this.restartGame();
        return;
      }
      if (command.type === 'REMATCH') {
        this.rematch(command.playerId);
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
      case 'RESTART_GAME':
        this.restartGame();
        return;
      case 'REMATCH':
        this.rematch(command.playerId);
        return;
      case 'CONFIRM_IDENTITY':
        this.confirmIdentity(command.playerId);
        return;
      case 'SELECT_COIN_TARGET':
        if (this.gameState.currentCoinHolderId !== command.playerId) {
          throw new Error('只有当前金币持有人可以选择下一位水晶玩家');
        }
        this.engine.selectCoinTarget(command.targetId);
        break;
      case 'SELECT_SPEAKING_ORDER':
        this.engine.selectSpeakingOrder(command.playerId, command.firstPlayerId, command.direction);
        break;
      case 'END_SPEAKING':
        this.engine.endSpeaking(command.playerId);
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
        this.confirmIdentity(command.playerId);
        return;
      case 'RESOLVE_ROUND':
        this.confirmIdentity(command.playerId);
        return;
      case 'CHECK_VICTORY':
        this.confirmIdentity(command.playerId);
        return;
    }

    this.gameState = this.engine.getState();
    this.emit();
  }
}

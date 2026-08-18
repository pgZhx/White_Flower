import type { ClientView } from '@rose-blade/game-engine';
import type { RoomPlayer, RoomState } from '@rose-blade/p2p-network';
import { HostGameController, type GameCommand } from './HostGameController';
import type { NetworkHost } from '../network/NetworkHost';
import type { GameClient, GameOverSnapshot, PendingMagic10View } from './GameClient';

export class HostGameClient implements GameClient {
  readonly isHost = true;
  readonly playerId: string;
  readonly roomId: string;

  constructor(
    readonly controller: HostGameController,
    private readonly networkHost: NetworkHost,
    private readonly transport: { disconnect(): void },
  ) {
    this.roomId = controller.roomId;
    this.playerId = controller.hostPlayerId;
  }

  subscribe(listener: () => void): () => void {
    return this.controller.subscribe(listener);
  }

  getLobby(): RoomState | null {
    return this.controller.room;
  }

  getView(playerId?: string): ClientView | null {
    return this.controller.getView(playerId ?? this.controller.hostPlayerId);
  }

  get phase(): string {
    return this.controller.phase;
  }

  get players(): RoomPlayer[] {
    return this.controller.room.players;
  }

  get hostPlayerId(): string {
    return this.controller.hostPlayerId;
  }

  get allIdentitiesConfirmed(): boolean {
    return this.controller.allIdentitiesConfirmed;
  }

  get currentPlayerId(): string | null {
    return this.controller.currentPlayerId;
  }

  setReady(ready: boolean): void {
    this.controller.setReady(this.controller.hostPlayerId, ready);
  }

  handleCommand(command: GameCommand): void {
    this.controller.handleCommand(command);
  }

  confirmIdentity(playerId?: string): void {
    this.controller.confirmIdentity(playerId ?? this.controller.hostPlayerId);
  }

  startGame(): void {
    this.controller.startGame();
  }

  canPass(playerId: string): boolean {
    return this.controller.canPass(playerId);
  }

  isRandomForced(playerId: string): boolean {
    return this.controller.isRandomForced(playerId);
  }

  getPendingMagic10(): PendingMagic10View | null {
    const pending = this.controller.getPendingMagic10();
    if (!pending) return null;
    return { casterId: pending.casterId, targetId: pending.targetId };
  }

  getGameOverSnapshot(): GameOverSnapshot | null {
    const snapshot = this.controller.getGameOverSnapshot();
    if (!snapshot) return null;
    return {
      winner: snapshot.winner,
      winReason: snapshot.winReason,
      players: snapshot.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        role: p.role,
        faction: p.faction,
        hand: p.hand,
      })),
    };
  }

  disconnect(): void {
    this.networkHost.destroy();
    this.transport.disconnect();
  }
}

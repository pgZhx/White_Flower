import type { Card, ClientView, Faction, Role } from '@rose-blade/game-engine';
import type { RoomPlayer, RoomState } from '@rose-blade/p2p-network';
import type { GameCommand } from './HostGameController';
import type { VoiceSignaling } from '../voice/VoiceRoom';

export interface GameOverPlayer {
  id: string;
  nickname: string;
  role: Role | null;
  faction: Faction | null;
  hand: Card[];
}

export interface GameOverSnapshot {
  winner: Faction | null;
  winReason: string | null;
  players: GameOverPlayer[];
}

export interface PendingMagic10View {
  casterId: string;
  targetId: string | null;
}

export interface GameClient {
  readonly roomId: string;
  readonly isHost: boolean;
  readonly playerId: string | null;
  subscribe(listener: () => void): () => void;
  getLobby(): RoomState | null;
  getView(playerId?: string): ClientView | null;
  get phase(): string;
  get players(): RoomPlayer[];
  get hostPlayerId(): string;
  get allIdentitiesConfirmed(): boolean;
  get currentPlayerId(): string | null;
  setReady(ready: boolean): void;
  kickPlayer(playerId: string): void;
  handleCommand(command: GameCommand): void;
  confirmIdentity(playerId?: string): void;
  startGame(): void;
  canPass(playerId: string): boolean;
  isRandomForced(playerId: string): boolean;
  getPendingMagic10(): PendingMagic10View | null;
  getGameOverSnapshot(): GameOverSnapshot | null;
  getVoiceSignaling(): VoiceSignaling;
  get lastError(): string | null;
  get lastErrorCode(): string | null;
  reconnect?(): Promise<void>;
  disconnect(): void;
}

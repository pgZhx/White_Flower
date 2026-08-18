import type { ClientView } from '@rose-blade/game-engine';
import type { RoomPlayer, RoomState } from '@rose-blade/p2p-network';
import { NetworkPeer, type PeerCommand } from '../network/NetworkPeer';
import type { GameClient, GameOverSnapshot, PendingMagic10View } from './GameClient';
import type { GameCommand } from './HostGameController';

const JOIN_TIMEOUT_MS = 12000;

export class PeerGameClient implements GameClient {
  readonly isHost = false;
  readonly roomId: string;
  private networkPeer: NetworkPeer;

  constructor(networkPeer: NetworkPeer, roomId: string) {
    this.networkPeer = networkPeer;
    this.roomId = roomId;
  }

  get playerId(): string | null {
    return this.networkPeer.state.playerId;
  }

  subscribe(listener: () => void): () => void {
    return this.networkPeer.subscribe(listener);
  }

  async connect(nickname: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('无法连接房主，请确认房间码正确、房主在线且网络正常。'));
      }, JOIN_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(timer);
        unsub();
      };

      const unsub = this.networkPeer.subscribe(() => {
        if (this.networkPeer.state.playerId) {
          cleanup();
          resolve();
        } else if (this.networkPeer.state.lastError) {
          cleanup();
          reject(new Error(this.networkPeer.state.lastError));
        }
      });

      this.networkPeer.join(this.roomId, nickname);
    });
  }

  getLobby(): RoomState | null {
    return this.networkPeer.state.room;
  }

  getView(playerId?: string): ClientView | null {
    if (playerId && playerId !== this.playerId) return null;
    return this.networkPeer.state.view;
  }

  get phase(): string {
    return this.networkPeer.state.view?.phase ?? 'LOBBY';
  }

  get players(): RoomPlayer[] {
    return this.networkPeer.state.room?.players ?? [];
  }

  get hostPlayerId(): string {
    return this.networkPeer.state.room?.hostPlayerId ?? '';
  }

  get allIdentitiesConfirmed(): boolean {
    return this.networkPeer.state.view?.phaseConfirmation?.allConfirmed ?? false;
  }

  get currentPlayerId(): string | null {
    const round = this.networkPeer.state.view?.round;
    if (!round) return null;
    return round.actionOrder[round.currentActionIndex] ?? null;
  }

  setReady(ready: boolean): void {
    this.networkPeer.setReady(ready);
  }

  handleCommand(command: GameCommand): void {
    const { playerId: _ignored, ...clean } = command;
    this.networkPeer.sendCommand(clean as PeerCommand);
  }

  confirmIdentity(_playerId?: string): void {
    this.handleCommand({ type: 'CONFIRM_IDENTITY', playerId: this.playerId ?? '' });
  }

  startGame(): void {
    throw new Error('只有房主可以开始游戏');
  }

  canPass(playerId: string): boolean {
    const view = this.networkPeer.state.view;
    if (playerId !== this.playerId || !view) return false;
    return view.me.canPass ?? true;
  }

  isRandomForced(playerId: string): boolean {
    const view = this.networkPeer.state.view;
    if (playerId !== this.playerId || !view) return false;
    return view.me.isRandomForced ?? false;
  }

  getPendingMagic10(): PendingMagic10View | null {
    return this.networkPeer.state.view?.round?.pendingMagic10 ?? null;
  }

  getGameOverSnapshot(): GameOverSnapshot | null {
    const view = this.networkPeer.state.view;
    if (!view || view.phase !== 'GAME_OVER') return null;
    return {
      winner: view.winner,
      winReason: view.winReason,
      players: view.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        role: p.role ?? null,
        faction: p.faction ?? null,
        hand: p.hand ?? [],
      })),
    };
  }

  disconnect(): void {
    this.networkPeer.disconnect();
  }
}

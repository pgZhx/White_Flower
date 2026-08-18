export type NetworkMessageType =
  | 'JOIN_REQUEST'
  | 'JOIN_ACCEPTED'
  | 'JOIN_REJECTED'
  | 'LOBBY_SNAPSHOT'
  | 'PLAYER_READY_CHANGED'
  | 'GAME_COMMAND'
  | 'PLAYER_VIEW'
  | 'PUBLIC_EVENT'
  | 'HOST_ERROR'
  | 'PING';

export interface NetworkMessageBase {
  version: 1;
  type: NetworkMessageType;
  messageId: string;
  roomId?: string;
  playerId?: string;
}

export interface JoinRequest extends NetworkMessageBase {
  type: 'JOIN_REQUEST';
  nickname: string;
}

export interface JoinAccepted extends NetworkMessageBase {
  type: 'JOIN_ACCEPTED';
  payload: {
    playerId: string;
    hostPlayerId: string;
    roomState: RoomState;
  };
}

export interface JoinRejected extends NetworkMessageBase {
  type: 'JOIN_REJECTED';
  payload: { reason: string };
}

export interface LobbySnapshot extends NetworkMessageBase {
  type: 'LOBBY_SNAPSHOT';
  payload: { roomState: RoomState };
}

export interface PlayerReadyChanged extends NetworkMessageBase {
  type: 'PLAYER_READY_CHANGED';
  payload: { playerId: string; ready: boolean };
}

export interface GameCommandMessage extends NetworkMessageBase {
  type: 'GAME_COMMAND';
  payload: unknown;
}

export interface PlayerViewMessage extends NetworkMessageBase {
  type: 'PLAYER_VIEW';
  payload: { view: unknown; phase: string };
}

export interface PublicEventMessage extends NetworkMessageBase {
  type: 'PUBLIC_EVENT';
  payload: { event: unknown };
}

export interface HostErrorMessage extends NetworkMessageBase {
  type: 'HOST_ERROR';
  payload: { code: string; message: string };
}

export interface PingMessage extends NetworkMessageBase {
  type: 'PING';
  payload: { timestamp: number };
}

export type NetworkMessage =
  | JoinRequest
  | JoinAccepted
  | JoinRejected
  | LobbySnapshot
  | PlayerReadyChanged
  | GameCommandMessage
  | PlayerViewMessage
  | PublicEventMessage
  | HostErrorMessage
  | PingMessage;

export interface RoomPlayer {
  id: string;
  nickname: string;
  seat: number;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface RoomState {
  roomId: string;
  hostPlayerId: string;
  players: RoomPlayer[];
  status: 'LOBBY' | 'PLAYING' | 'FINISHED' | 'CLOSED';
}

export type Unsubscribe = () => void;

export interface MultiplayerTransport {
  connect(): Promise<void>;
  sendTo(playerId: string, message: NetworkMessage): void;
  send(message: NetworkMessage): void;
  broadcast(message: NetworkMessage): void;
  onMessage(handler: (message: NetworkMessage) => void): Unsubscribe;
  disconnect(): void;
}

export type PeerId = string;
export type PlayerId = string;
export type SessionId = string;

export type NetworkMessageType =
  | 'JOIN_REQUEST'
  | 'JOIN_ACCEPTED'
  | 'JOIN_REJECTED'
  | 'LOBBY_SNAPSHOT'
  | 'READY_COMMAND'
  | 'PLAYER_READY_CHANGED'
  | 'GAME_COMMAND'
  | 'PLAYER_VIEW'
  | 'PUBLIC_EVENT'
  | 'HOST_ERROR'
  | 'HOST_DISCONNECTED'
  | 'PING';

export interface NetworkMessageBase {
  version: 1;
  type: NetworkMessageType;
  messageId: string;
  roomId?: string;
  playerId?: string;
  sessionId?: string;
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
  payload: { reason: string; code?: string };
}

export interface LobbySnapshot extends NetworkMessageBase {
  type: 'LOBBY_SNAPSHOT';
  payload: { roomState: RoomState };
}

export interface ReadyCommand extends NetworkMessageBase {
  type: 'READY_COMMAND';
  ready: boolean;
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

export interface HostDisconnectedMessage extends NetworkMessageBase {
  type: 'HOST_DISCONNECTED';
  payload: { message: string };
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
  | ReadyCommand
  | PlayerReadyChanged
  | GameCommandMessage
  | PlayerViewMessage
  | PublicEventMessage
  | HostErrorMessage
  | HostDisconnectedMessage
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
  readonly id?: string;
  connect(): Promise<void>;
  sendTo(peerId: string, message: NetworkMessage): void;
  send(message: NetworkMessage): void;
  broadcast(message: NetworkMessage): void;
  onMessage(handler: (message: NetworkMessage, fromPeerId?: string) => void): Unsubscribe;
  onPeerConnected(handler: (peerId: string) => void): Unsubscribe;
  onPeerDisconnected(handler: (peerId: string) => void): Unsubscribe;
  disconnect(): void;
}

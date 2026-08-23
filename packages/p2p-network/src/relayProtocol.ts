/**
 * Transport-level protocol between browser WebSocketRelayTransport and the
 * lightweight Node relay server.
 *
 * This protocol intentionally knows nothing about the game. It only routes
 * opaque payloads between Host and Peers.
 */

export type RelayRole = 'host' | 'peer';

export type RelayClientMessage =
  | { kind: 'REGISTER_HOST'; roomId: string; clientId: string }
  | { kind: 'REGISTER_PEER'; roomId: string; clientId: string }
  | { kind: 'ROUTE_TO_HOST'; payload: unknown }
  | { kind: 'ROUTE_TO_PEER'; toPeerId: string; payload: unknown }
  | { kind: 'DISCONNECT_PEER'; peerId: string }
  | { kind: 'BROADCAST'; payload: unknown };

export type RelayServerMessage =
  | {
      kind: 'REGISTERED';
      role: RelayRole;
      roomId: string;
      clientId: string;
      hostClientId?: string;
    }
  | { kind: 'PEER_CONNECTED'; peerId: string }
  | { kind: 'PEER_DISCONNECTED'; peerId: string }
  | { kind: 'MESSAGE'; fromPeerId: string; payload: unknown }
  | { kind: 'HOST_DISCONNECTED'; message?: string }
  | { kind: 'ERROR'; code: string; message: string };

export type RelayEnvelope = RelayClientMessage | RelayServerMessage;

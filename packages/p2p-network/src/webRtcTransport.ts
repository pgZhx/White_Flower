import Peer, { type DataConnection } from 'peerjs';
import type { MultiplayerTransport, NetworkMessage, Unsubscribe } from './types.js';

export interface WebRtcTransportOptions {
  role: 'host' | 'peer';
  peerId: string;
  hostPeerId?: string;
}

/**
 * WebRtcTransport uses PeerJS as a browser-only signaling/connection layer.
 * It depends on PeerJS's public cloud signaling infrastructure; no game backend is needed.
 */
export class WebRtcTransport implements MultiplayerTransport {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private connections = new Map<string, DataConnection>();
  private handlers = new Set<(message: NetworkMessage) => void>();
  private readonly options: WebRtcTransportOptions;

  constructor(options: WebRtcTransportOptions) {
    this.options = options;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(this.options.peerId);
      this.peer = peer;

      const cleanup = () => {
        peer.off('open');
        peer.off('error');
      };

      peer.on('open', () => {
        if (this.options.role === 'peer' && this.options.hostPeerId) {
          const conn = peer.connect(this.options.hostPeerId, { reliable: true });
          this.conn = conn;
          conn.on('open', () => {
            this.connections.set(this.options.hostPeerId!, conn);
            resolve();
          });
          conn.on('data', (data) => this.handleData(data));
          conn.on('close', () => this.connections.delete(this.options.hostPeerId!));
          conn.on('error', (error) => reject(error));
        } else {
          resolve();
        }
        cleanup();
      });

      peer.on('connection', (conn) => {
        this.connections.set(conn.peer, conn);
        conn.on('data', (data) => this.handleData(data));
        conn.on('close', () => this.connections.delete(conn.peer));
      });

      peer.on('error', (error) => {
        cleanup();
        reject(error);
      });
    });
  }

  sendTo(playerId: string, message: NetworkMessage): void {
    const conn = this.connections.get(playerId);
    if (!conn) {
      throw new Error(`No connection to ${playerId}`);
    }
    conn.send(message);
  }

  send(message: NetworkMessage): void {
    if (this.options.role === 'peer' && this.options.hostPeerId) {
      this.sendTo(this.options.hostPeerId, message);
      return;
    }
    if (this.conn) {
      this.conn.send(message);
      return;
    }
    const first = this.connections.values().next().value as DataConnection | undefined;
    if (!first) throw new Error('No peer connection');
    first.send(message);
  }

  broadcast(message: NetworkMessage): void {
    for (const conn of this.connections.values()) {
      conn.send(message);
    }
  }

  onMessage(handler: (message: NetworkMessage) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  disconnect(): void {
    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();
    this.peer?.destroy();
    this.peer = null;
    this.conn = null;
  }

  private handleData(data: unknown): void {
    if (!data || typeof data !== 'object' || !('type' in data)) {
      return;
    }
    const message = data as NetworkMessage;
    for (const handler of this.handlers) {
      handler(message);
    }
  }
}

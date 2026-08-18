import Peer, { type DataConnection } from 'peerjs';
import type { MultiplayerTransport, NetworkMessage, Unsubscribe } from './types.js';

export interface WebRtcTransportOptions {
  role: 'host' | 'peer';
  peerId: string;
  hostPeerId?: string;
  host?: string;
  port?: number;
  path?: string;
  secure?: boolean;
}

/**
 * WebRtcTransport uses PeerJS as a browser-only signaling/connection layer.
 * It depends on PeerJS's public cloud signaling infrastructure; no game backend is needed.
 */
export class WebRtcTransport implements MultiplayerTransport {
  readonly id: string;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private connections = new Map<string, DataConnection>();
  private handlers = new Set<(message: NetworkMessage, fromPeerId?: string) => void>();
  private connectedHandlers = new Set<(peerId: string) => void>();
  private disconnectedHandlers = new Set<(peerId: string) => void>();
  private readonly options: WebRtcTransportOptions;

  constructor(options: WebRtcTransportOptions) {
    this.options = options;
    this.id = options.peerId;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(this.options.peerId, {
        host: this.options.host ?? '0.peerjs.com',
        port: this.options.port ?? 443,
        path: this.options.path ?? '/',
        secure: this.options.secure ?? true,
      });
      this.peer = peer;
      let settled = false;

      const cleanup = () => {
        // Keep connection/disconnected listeners after open: the host must
        // continue accepting new peers and noticing closed data channels.
        peer.off('open');
        peer.off('error');
      };

      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      peer.on('error', (error) => {
        fail(error);
      });

      peer.on('open', () => {
        if (this.options.role === 'peer' && this.options.hostPeerId) {
          const conn = peer.connect(this.options.hostPeerId, { reliable: true });
          this.conn = conn;
          conn.on('open', () => {
            this.connections.set(this.options.hostPeerId!, conn);
            if (!settled) {
              settled = true;
              cleanup();
              resolve();
            }
          });
          conn.on('data', (data) => this.handleData(data, this.options.hostPeerId!));
          conn.on('close', () => {
            this.connections.delete(this.options.hostPeerId!);
            for (const handler of this.disconnectedHandlers) handler(this.options.hostPeerId!);
          });
          conn.on('error', (error) => fail(error));
        } else {
          if (!settled) {
            settled = true;
            cleanup();
            resolve();
          }
        }
      });

      peer.on('connection', (conn) => {
        this.connections.set(conn.peer, conn);
        for (const handler of this.connectedHandlers) handler(conn.peer);
        conn.on('data', (data) => this.handleData(data, conn.peer));
        conn.on('close', () => {
          this.connections.delete(conn.peer);
          for (const handler of this.disconnectedHandlers) handler(conn.peer);
        });
        conn.on('error', (error) => {
          this.connections.delete(conn.peer);
          for (const handler of this.disconnectedHandlers) handler(conn.peer);
          // Surface unexpected connection errors to message handlers as HOST_ERROR? Keep console for now.
          console.error('DataConnection error', error);
        });
      });

      peer.on('disconnected', () => {
        if (!settled) {
          fail(new Error('PeerJS disconnected from signaling server'));
        }
      });
    });
  }

  sendTo(peerId: string, message: NetworkMessage): void {
    if (this.options.role === 'peer' && this.options.hostPeerId) {
      if (peerId !== this.options.hostPeerId) {
        throw new Error(`Peer client can only send to host (${this.options.hostPeerId})`);
      }
      this.conn?.send(message);
      return;
    }
    const conn = this.connections.get(peerId);
    if (!conn) {
      throw new Error(`No connection to ${peerId}`);
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

  onMessage(handler: (message: NetworkMessage, fromPeerId?: string) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  onPeerConnected(handler: (peerId: string) => void): Unsubscribe {
    this.connectedHandlers.add(handler);
    return () => {
      this.connectedHandlers.delete(handler);
    };
  }

  onPeerDisconnected(handler: (peerId: string) => void): Unsubscribe {
    this.disconnectedHandlers.add(handler);
    return () => {
      this.disconnectedHandlers.delete(handler);
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

  private handleData(data: unknown, fromPeerId?: string): void {
    if (!data || typeof data !== 'object' || !('type' in data)) {
      return;
    }
    const message = data as NetworkMessage;
    for (const handler of this.handlers) {
      handler(message, fromPeerId);
    }
  }
}

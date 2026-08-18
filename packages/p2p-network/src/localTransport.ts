import type { MultiplayerTransport, NetworkMessage, Unsubscribe } from './types.js';

/**
 * LocalTransport simulates a point-to-point channel inside one browser/tests.
 * It is used for local simulation and automated tests before WebRTC is ready.
 */
export class LocalTransport implements MultiplayerTransport {
  private readonly _id: string | undefined;
  private handlers = new Set<(message: NetworkMessage, fromPeerId?: string) => void>();
  private peer: LocalTransport | null = null;

  constructor(id: string | undefined = undefined) {
    this._id = id;
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  link(peer: LocalTransport): void {
    this.peer = peer;
  }

  sendTo(_peerId: string, message: NetworkMessage): void {
    this.send(message);
  }

  send(message: NetworkMessage): void {
    if (!this.peer) {
      throw new Error('LocalTransport has no linked peer');
    }
    queueMicrotask(() => {
      this.peer?.receive(message, this._id);
    });
  }

  broadcast(message: NetworkMessage): void {
    this.send(message);
  }

  receive(message: NetworkMessage, fromPeerId?: string): void {
    for (const handler of this.handlers) {
      handler(message, fromPeerId);
    }
  }

  onMessage(handler: (message: NetworkMessage, fromPeerId?: string) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  onPeerConnected(_handler: (peerId: string) => void): Unsubscribe {
    return () => undefined;
  }

  onPeerDisconnected(_handler: (peerId: string) => void): Unsubscribe {
    return () => undefined;
  }

  disconnect(): void {
    this.handlers.clear();
    this.peer = null;
  }
}

import type { MultiplayerTransport, NetworkMessage, Unsubscribe } from './types.js';

/**
 * LocalTransport simulates a point-to-point channel inside one browser/tests.
 * It is used for local simulation and automated tests before WebRTC is ready.
 */
export class LocalTransport implements MultiplayerTransport {
  private handlers = new Set<(message: NetworkMessage) => void>();
  private peer: LocalTransport | null = null;

  connect(): Promise<void> {
    return Promise.resolve();
  }

  link(peer: LocalTransport): void {
    this.peer = peer;
  }

  send(message: NetworkMessage): void {
    if (!this.peer) {
      throw new Error('LocalTransport has no linked peer');
    }
    queueMicrotask(() => {
      this.peer?.receive(message);
    });
  }

  broadcast(message: NetworkMessage): void {
    this.send(message);
  }

  receive(message: NetworkMessage): void {
    for (const handler of this.handlers) {
      handler(message);
    }
  }

  onMessage(handler: (message: NetworkMessage) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  disconnect(): void {
    this.handlers.clear();
    this.peer = null;
  }
}

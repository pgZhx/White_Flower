import type { MultiplayerTransport, NetworkMessage, Unsubscribe } from './types.js';
import type { RelayClientMessage, RelayServerMessage } from './relayProtocol.js';

function transportError(code: string, message: string): Error {
  const error = new Error(message);
  (error as Error & { code?: string }).code = code;
  return error;
}

export interface WebSocketRelayTransportOptions {
  role: 'host' | 'peer';
  roomId: string;
  clientId: string;
  url: string;
  connectTimeoutMs?: number;
}

export function getRelayUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:9001/relay';
  }
  const params = new URLSearchParams(window.location.search);
  const override = params.get('relayUrl');
  if (override) return override;

  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (isLocal) {
    return 'ws://localhost:9001/relay';
  }

  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}/relay`;
}

export class WebSocketRelayTransport implements MultiplayerTransport {
  readonly id: string;
  private socket: WebSocket | null = null;
  private settled = false;
  private manuallyClosed = false;
  private hostClientId: string | null = null;
  private handlers = new Set<(message: NetworkMessage, fromPeerId?: string) => void>();
  private connectedHandlers = new Set<(peerId: string) => void>();
  private disconnectedHandlers = new Set<(peerId: string) => void>();
  private readonly options: WebSocketRelayTransportOptions;

  constructor(options: WebSocketRelayTransportOptions) {
    this.options = options;
    this.id = options.clientId;
  }

  connect(): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this.settled) {
      return Promise.reject(new Error('Transport has already settled'));
    }

    return new Promise<void>((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.options.url);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('无法创建 WebSocket'));
        return;
      }
      this.socket = ws;

      let timeout: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        timeout = undefined;
      };
      const fail = (error: Error) => {
        if (this.settled) return;
        this.settled = true;
        cleanup();
        reject(error);
      };

      ws.onopen = () => {
        const register: RelayClientMessage =
          this.options.role === 'host'
            ? { kind: 'REGISTER_HOST', roomId: this.options.roomId, clientId: this.options.clientId }
            : { kind: 'REGISTER_PEER', roomId: this.options.roomId, clientId: this.options.clientId };
        ws.send(JSON.stringify(register));
      };

      ws.onmessage = (event: MessageEvent) => {
        let data: RelayServerMessage;
        try {
          data = JSON.parse(String(event.data)) as RelayServerMessage;
        } catch {
          return;
        }

        if (data.kind === 'REGISTERED') {
          if (data.role === this.options.role && data.clientId === this.options.clientId) {
            if (data.role === 'peer' && data.hostClientId) {
              this.hostClientId = data.hostClientId;
            }
            if (!this.settled) {
              this.settled = true;
              cleanup();
              resolve();
            }
          }
          return;
        }

        if (data.kind === 'ERROR') {
          const error = new Error(data.message);
          (error as { code?: string }).code = data.code;
          fail(error);
          return;
        }

        if (this.settled) {
          this.handleServerMessage(data);
        }
      };

      ws.onclose = () => {
        cleanup();
        if (!this.settled) {
          fail(transportError('SERVER_UNAVAILABLE', 'WebSocket 连接已关闭'));
          return;
        }
        // Only report the socket that is still the active transport. A newer
        // reconnect socket may have already replaced this one.
        if (this.socket === ws) {
          this.notifyDisconnected();
        }
      };

      ws.onerror = () => {
        if (!this.settled) {
          fail(transportError('SERVER_UNAVAILABLE', '无法连接 Relay 服务'));
        }
      };

      timeout = setTimeout(() => {
        fail(transportError('CONNECTION_TIMEOUT', '连接超时，请确认网络或 Relay 服务可用。'));
      }, this.options.connectTimeoutMs ?? 10000);
    });
  }

  sendTo(peerId: string, message: NetworkMessage): void {
    if (this.options.role === 'peer') {
      if (this.hostClientId && peerId !== this.hostClientId) {
        throw new Error(`Peer can only send to host (${this.hostClientId})`);
      }
      this.sendEnvelope({ kind: 'ROUTE_TO_HOST', payload: message });
      return;
    }
    this.sendEnvelope({ kind: 'ROUTE_TO_PEER', toPeerId: peerId, payload: message });
  }

  send(message: NetworkMessage): void {
    if (this.options.role === 'peer') {
      this.sendEnvelope({ kind: 'ROUTE_TO_HOST', payload: message });
      return;
    }
    this.sendEnvelope({ kind: 'BROADCAST', payload: message });
  }

  broadcast(message: NetworkMessage): void {
    this.sendEnvelope({ kind: 'BROADCAST', payload: message });
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

  disconnectPeer(peerId: string): void {
    if (this.options.role !== 'host') return;
    this.sendEnvelope({ kind: 'DISCONNECT_PEER', peerId });
  }

  async reconnect(): Promise<void> {
    this.manuallyClosed = false;
    this.settled = false;
    this.socket = null;
    await this.connect();
  }

  disconnect(): void {
    this.manuallyClosed = true;
    const ws = this.socket;
    this.socket = null;
    this.settled = true;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }

  private sendEnvelope(message: RelayClientMessage): void {
    const ws = this.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket Relay 未连接');
    }
    ws.send(JSON.stringify(message));
  }

  private handleServerMessage(message: RelayServerMessage): void {
    switch (message.kind) {
      case 'MESSAGE': {
        const payload = message.payload;
        if (!payload || typeof payload !== 'object' || !('type' in payload)) {
          return;
        }
        const networkMessage = payload as NetworkMessage;
        for (const handler of this.handlers) {
          handler(networkMessage, message.fromPeerId);
        }
        return;
      }
      case 'PEER_CONNECTED':
        for (const handler of this.connectedHandlers) {
          handler(message.peerId);
        }
        return;
      case 'PEER_DISCONNECTED':
        for (const handler of this.disconnectedHandlers) {
          handler(message.peerId);
        }
        return;
      case 'HOST_DISCONNECTED':
        this.notifyDisconnected();
        return;
      default:
        return;
    }
  }

  private notifyDisconnected(): void {
    const peerId = this.hostClientId ?? 'host';
    for (const handler of this.disconnectedHandlers) {
      handler(peerId);
    }
  }
}

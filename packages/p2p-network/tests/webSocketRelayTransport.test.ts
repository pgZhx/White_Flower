import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  WebSocketRelayTransport,
  createMessage,
  generateRoomCode,
  type JoinRequest,
  type LobbySnapshot,
  type RoomState,
} from '../src/index.js';

let child: ChildProcess | null = null;
let relayUrl = '';

function waitForRelayStart(proc: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let errorBuffer = '';
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = buffer.match(/relay started port=(\d+)/);
      if (match) {
        proc.stdout?.off('data', onData);
        resolve(`ws://127.0.0.1:${Number(match[1])}/relay`);
      }
    };
    const onError = (chunk: Buffer) => {
      errorBuffer += chunk.toString();
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onError);
    proc.once('error', reject);
    proc.once('exit', (code) => reject(new Error(`relay exited early: ${code} ${errorBuffer.trim()}`)));
    setTimeout(() => reject(new Error('relay start timeout')), 5000).unref?.();
  });
}

beforeAll(async () => {
  const relayServerPath = fileURLToPath(new URL('../../../server/relay-server.mjs', import.meta.url));
  child = spawn(process.execPath, [relayServerPath], {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  relayUrl = await waitForRelayStart(child);
});

afterAll(() => {
  if (child && !child.killed) {
    child.kill();
  }
});

const roomState = (roomId: string): RoomState => ({
  roomId,
  hostPlayerId: 'host-player',
  players: [],
  status: 'LOBBY',
});

describe('WebSocketRelayTransport', () => {
  it('connects host and peer, routes messages both ways, and handles disconnect', async () => {
    const roomId = generateRoomCode();
    const host = new WebSocketRelayTransport({
      role: 'host',
      roomId,
      clientId: 'host-transport',
      url: relayUrl,
    });

    const peerConnected = new Promise<string>((resolve) => {
      host.onPeerConnected((peerId) => resolve(peerId));
    });

    await host.connect();
    const peer = new WebSocketRelayTransport({
      role: 'peer',
      roomId,
      clientId: 'peer-transport',
      url: relayUrl,
    });
    await peer.connect();

    expect(await peerConnected).toBe('peer-transport');

    const hostGotPeerMessage = new Promise<{ message: JoinRequest; from: string | undefined }>((resolve) => {
      host.onMessage((message, from) => {
        resolve({ message: message as JoinRequest, from });
      });
    });
    peer.send(createMessage<JoinRequest>('JOIN_REQUEST', { roomId, nickname: 'Alice' }));
    const receivedByHost = await hostGotPeerMessage;
    expect(receivedByHost.from).toBe('peer-transport');
    expect(receivedByHost.message.type).toBe('JOIN_REQUEST');
    expect(receivedByHost.message.nickname).toBe('Alice');

    const peerGotHostMessage = new Promise<LobbySnapshot>((resolve) => {
      peer.onMessage((message) => resolve(message as LobbySnapshot));
    });
    host.sendTo('peer-transport', createMessage<LobbySnapshot>('LOBBY_SNAPSHOT', {
      payload: { roomState: roomState(roomId) },
    }));
    const receivedByPeer = await peerGotHostMessage;
    expect(receivedByPeer.type).toBe('LOBBY_SNAPSHOT');
    expect(receivedByPeer.payload.roomState.roomId).toBe(roomId);

    const hostSeesPeerDisconnect = new Promise<string>((resolve) => {
      host.onPeerDisconnected((peerId) => resolve(peerId));
    });
    peer.disconnect();
    expect(await hostSeesPeerDisconnect).toBe('peer-transport');

    host.disconnect();
  });

  it('broadcasts from host to connected peers', async () => {
    const roomId = generateRoomCode();
    const host = new WebSocketRelayTransport({ role: 'host', roomId, clientId: 'host-bc', url: relayUrl });
    const peerA = new WebSocketRelayTransport({ role: 'peer', roomId, clientId: 'peer-bc-a', url: relayUrl });
    const peerB = new WebSocketRelayTransport({ role: 'peer', roomId, clientId: 'peer-bc-b', url: relayUrl });

    const waitForPeer = (expected: string) =>
      new Promise<string>((resolve) => {
        const unsub = host.onPeerConnected((peerId) => {
          if (peerId === expected) {
            unsub();
            resolve(peerId);
          }
        });
      });
    const aConnected = waitForPeer('peer-bc-a');
    const bConnected = waitForPeer('peer-bc-b');
    await host.connect();
    await peerA.connect();
    await peerB.connect();
    expect(await aConnected).toBe('peer-bc-a');
    expect(await bConnected).toBe('peer-bc-b');

    const gotA = new Promise<LobbySnapshot>((resolve) => peerA.onMessage((message) => resolve(message as LobbySnapshot)));
    const gotB = new Promise<LobbySnapshot>((resolve) => peerB.onMessage((message) => resolve(message as LobbySnapshot)));
    host.broadcast(createMessage<LobbySnapshot>('LOBBY_SNAPSHOT', {
      payload: { roomState: roomState(roomId) },
    }));

    expect((await gotA).payload.roomState.roomId).toBe(roomId);
    expect((await gotB).payload.roomState.roomId).toBe(roomId);

    host.disconnect();
    peerA.disconnect();
    peerB.disconnect();
  });
});

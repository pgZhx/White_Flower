import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateRoomCode } from '../src/index.js';

let child: ChildProcess | null = null;
let relayPort = 0;
let relayUrl = '';

async function waitForRelayStart(proc: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let errorBuffer = '';
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = buffer.match(/relay started port=(\d+)/);
      if (match) {
        proc.stdout?.off('data', onData);
        resolve(Number(match[1]));
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
  relayPort = await waitForRelayStart(child);
  relayUrl = `ws://127.0.0.1:${relayPort}/relay`;
});

afterAll(() => {
  if (child && !child.killed) {
    child.kill();
  }
});

function connect(url = relayUrl): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error('WebSocket connection failed'));
  });
}

function nextMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      ws.removeEventListener('message', onMessage);
      resolve(JSON.parse(String(event.data)) as Record<string, unknown>);
    };
    ws.addEventListener('message', onMessage);
  });
}

async function registerHost(roomId: string) {
  const ws = await connect();
  const sent = nextMessage(ws);
  ws.send(JSON.stringify({ kind: 'REGISTER_HOST', roomId, clientId: `host-${roomId}` }));
  const reply = await sent;
  return { ws, reply };
}

async function registerPeer(roomId: string, clientId: string) {
  const ws = await connect();
  const sent = nextMessage(ws);
  ws.send(JSON.stringify({ kind: 'REGISTER_PEER', roomId, clientId }));
  const reply = await sent;
  return { ws, reply };
}

describe('relay server', () => {
  it('registers host, peer, handles room errors and peer connected notification', async () => {
    const roomId = generateRoomCode();
    const host = await registerHost(roomId);
    expect(host.reply).toMatchObject({ kind: 'REGISTERED', role: 'host', roomId });

    const peerConnectedOnHost = nextMessage(host.ws);
    const peer = await registerPeer(roomId, `guest-${roomId}`);
    expect(peer.reply).toMatchObject({ kind: 'REGISTERED', role: 'peer', roomId, hostClientId: `host-${roomId}` });
    expect(await peerConnectedOnHost).toMatchObject({ kind: 'PEER_CONNECTED', peerId: `guest-${roomId}` });

    const missing = await registerPeer('NOPE1', 'x1');
    expect(missing.reply).toMatchObject({ kind: 'ERROR', code: 'ROOM_NOT_FOUND' });
    missing.ws.close();

    const duplicateHost = await connect();
    const dupReplyPromise = nextMessage(duplicateHost);
    duplicateHost.send(JSON.stringify({ kind: 'REGISTER_HOST', roomId, clientId: 'host-other' }));
    expect(await dupReplyPromise).toMatchObject({ kind: 'ERROR', code: 'ROOM_EXISTS' });
    duplicateHost.close();

    host.ws.close();
    peer.ws.close();
  });

  it('routes peer to host, host to peer, and broadcast', async () => {
    const roomId = generateRoomCode();
    const host = await registerHost(roomId);
    const peerA = await registerPeer(roomId, `a-${roomId}`);
    await nextMessage(host.ws); // consume PEER_CONNECTED
    const peerB = await registerPeer(roomId, `b-${roomId}`);
    await nextMessage(host.ws); // consume PEER_CONNECTED

    const hostGotA = nextMessage(host.ws);
    peerA.ws.send(JSON.stringify({ kind: 'ROUTE_TO_HOST', payload: { type: 'HELLO_FROM_A' } }));
    expect(await hostGotA).toMatchObject({ kind: 'MESSAGE', fromPeerId: `a-${roomId}`, payload: { type: 'HELLO_FROM_A' } });

    const aGotHost = nextMessage(peerA.ws);
    host.ws.send(JSON.stringify({ kind: 'ROUTE_TO_PEER', toPeerId: `a-${roomId}`, payload: { type: 'HELLO_TO_A' } }));
    expect(await aGotHost).toMatchObject({ kind: 'MESSAGE', fromPeerId: `host-${roomId}`, payload: { type: 'HELLO_TO_A' } });

    const bGotBroadcast = nextMessage(peerB.ws);
    host.ws.send(JSON.stringify({ kind: 'BROADCAST', payload: { type: 'BROADCAST_MSG' } }));
    expect(await bGotBroadcast).toMatchObject({ kind: 'MESSAGE', payload: { type: 'BROADCAST_MSG' } });

    host.ws.close();
    peerA.ws.close();
    peerB.ws.close();
  });

  it('notifies peer disconnected and host disconnected', async () => {
    const roomId = generateRoomCode();
    const host = await registerHost(roomId);
    const peer = await registerPeer(roomId, `bye-${roomId}`);
    await nextMessage(host.ws); // consume PEER_CONNECTED

    const hostSeesDisconnect = nextMessage(host.ws);
    peer.ws.close();
    expect(await hostSeesDisconnect).toMatchObject({ kind: 'PEER_DISCONNECTED', peerId: `bye-${roomId}` });

    host.ws.close();

    const hostDownRoom = generateRoomCode();
    const hostDown = await registerHost(hostDownRoom);
    const hostDownPeer = await registerPeer(hostDownRoom, `peer-${hostDownRoom}`);
    await nextMessage(hostDown.ws); // consume PEER_CONNECTED

    const peerSeesHostDisconnect = nextMessage(hostDownPeer.ws);
    hostDown.ws.close();
    expect(await peerSeesHostDisconnect).toMatchObject({ kind: 'HOST_DISCONNECTED' });

    hostDownPeer.ws.close();
  });
});

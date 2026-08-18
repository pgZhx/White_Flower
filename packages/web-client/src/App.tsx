import { useEffect, useMemo, useState } from 'react';
import {
  LocalTransport,
  WebRtcTransport,
  generateRoomCode,
  makePeerId,
  makePlayerId,
} from '@rose-blade/p2p-network';
import { HomeScreen } from './screens/HomeScreen';
import { ConnectingScreen } from './screens/ConnectingScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';
import { HostGameController } from './game/HostGameController';
import { HostGameClient } from './game/HostGameClient';
import { PeerGameClient } from './game/PeerGameClient';
import { NetworkHost } from './network/NetworkHost';
import { NetworkPeer } from './network/NetworkPeer';
import type { GameClient } from './game/GameClient';

export type Screen =
  | { name: 'home' }
  | { name: 'connecting'; message: string }
  | { name: 'lobby'; roomId: string; nickname: string; playerId: string; isHost: boolean }
  | { name: 'game'; roomId: string; nickname: string; playerId: string; isHost: boolean }
  | { name: 'error'; message: string };

function readRoomParam(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('room');
}

function isDebugMode(): boolean {
  return new URLSearchParams(window.location.search).get('debug') === '1';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('连接超时，请确认房主在线后重试。')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isUnavailableId(error: unknown): boolean {
  const e = error as { type?: string; message?: string } | null;
  return e?.type === 'unavailable-id' || /ID is taken|ID unavailable|already taken/i.test(e?.message ?? '');
}


function randomSeed(): number {
  return Date.now() + Math.floor(Math.random() * 100000);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '发生未知错误，请重试。';
}

async function createHostClient(nickname: string): Promise<HostGameClient> {
  let lastError: unknown = new Error('创建房间失败，请重试。');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomId = generateRoomCode();
    const controller = new HostGameController({ roomId, hostPlayerId: makePlayerId(), seed: randomSeed() });
    controller.addPlayer(nickname);
    const transport = new WebRtcTransport({ role: 'host', peerId: roomId });
    const networkHost = new NetworkHost(controller, transport);
    try {
      await transport.connect();
      return new HostGameClient(controller, networkHost, transport);
    } catch (error) {
      lastError = error;
      networkHost.destroy();
      transport.disconnect();
      if (isUnavailableId(error)) continue;
      break;
    }
  }
  throw lastError;
}

async function createPeerClient(nickname: string, roomId: string): Promise<PeerGameClient> {
  const peerId = makePeerId('guest');
  const transport = new WebRtcTransport({ role: 'peer', peerId, hostPeerId: roomId });
  try {
    await withTimeout(transport.connect(), 12000);
    const networkPeer = new NetworkPeer(transport, peerId);
    const peerClient = new PeerGameClient(networkPeer, roomId);
    await peerClient.connect(nickname);
    return peerClient;
  } catch (error) {
    transport.disconnect();
    throw error;
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [initialRoom, setInitialRoom] = useState<string | null>(null);
  const [client, setClient] = useState<GameClient | null>(null);
  const debugMode = useMemo(isDebugMode, []);

  useEffect(() => {
    setInitialRoom(readRoomParam());
  }, []);

  const handleCreate = async (nickname: string) => {
    if (debugMode) {
      const roomId = generateRoomCode();
      const controller = new HostGameController({ roomId, hostPlayerId: makePlayerId(), seed: randomSeed() });
      controller.addPlayer(nickname);
      const transport = new LocalTransport();
      const networkHost = new NetworkHost(controller, transport);
      const hostClient = new HostGameClient(controller, networkHost, transport);
      setClient(hostClient);
      setScreen({ name: 'lobby', roomId, nickname, playerId: hostClient.playerId, isHost: true });
      return;
    }

    setScreen({ name: 'connecting', message: '正在创建房间…' });
    try {
      const hostClient = await createHostClient(nickname);
      setClient(hostClient);
      setScreen({
        name: 'lobby',
        roomId: hostClient.roomId,
        nickname,
        playerId: hostClient.playerId,
        isHost: true,
      });
    } catch (error) {
      setScreen({ name: 'error', message: errorMessage(error) });
    }
  };

  const handleJoin = async (nickname: string, roomId: string) => {
    const normalizedRoomId = roomId.trim().toUpperCase();
    if (debugMode) {
      const roomId = generateRoomCode();
      const controller = new HostGameController({ roomId, hostPlayerId: makePlayerId(), seed: randomSeed() });
      controller.addPlayer('房主');
      controller.addPlayer(nickname);
      const transport = new LocalTransport();
      const networkHost = new NetworkHost(controller, transport);
      const hostClient = new HostGameClient(controller, networkHost, transport);
      setClient(hostClient);
      setScreen({
        name: 'lobby',
        roomId,
        nickname,
        playerId: hostClient.getLobby()?.players[1]?.id ?? hostClient.playerId,
        isHost: false,
      });
      return;
    }

    setScreen({ name: 'connecting', message: `正在连接房间 ${normalizedRoomId}…` });
    try {
      const peerClient = await createPeerClient(nickname, normalizedRoomId);
      setClient(peerClient);
      setScreen({
        name: 'lobby',
        roomId: normalizedRoomId,
        nickname,
        playerId: peerClient.playerId ?? '',
        isHost: false,
      });
    } catch (error) {
      setScreen({ name: 'error', message: errorMessage(error) });
    }
  };

  const handleLeave = () => {
    client?.disconnect();
    setClient(null);
    setScreen({ name: 'home' });
  };

  const handleStart = () => {
    if (!client) return;
    client.startGame();
    setScreen({
      name: 'game',
      roomId: client.roomId,
      nickname: screen.name === 'lobby' ? screen.nickname : '',
      playerId: client.playerId ?? '',
      isHost: client.isHost,
    });
  };

  if (screen.name === 'home') {
    return (
      <HomeScreen
        initialRoom={initialRoom ?? undefined}
        onCreate={handleCreate}
        onJoin={handleJoin}
      />
    );
  }

  if (screen.name === 'connecting') {
    return <ConnectingScreen message={screen.message} />;
  }

  if (screen.name === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cathedral px-4">
        <div className="w-full max-w-md rounded-lg border border-stone-700 bg-stone-900 p-8 text-center">
          <h1 className="text-xl font-serif text-rose">无法继续</h1>
          <p className="mt-3 text-stone-300">{screen.message}</p>
          <button
            className="mt-6 rounded bg-blood px-5 py-2 font-semibold text-white hover:bg-red-800"
            onClick={() => setScreen({ name: 'home' })}
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  if (screen.name === 'lobby') {
    return (
      <LobbyScreen
        roomId={screen.roomId}
        nickname={screen.nickname}
        playerId={screen.playerId}
        isHost={screen.isHost}
        client={client}
        debug={debugMode}
        onStart={handleStart}
        onLeave={handleLeave}
      />
    );
  }

  return (
    <GameScreen
      roomId={screen.roomId}
      nickname={screen.nickname}
      playerId={screen.playerId}
      isHost={screen.isHost}
      client={client}
      debug={debugMode}
      onExit={handleLeave}
    />
  );
}

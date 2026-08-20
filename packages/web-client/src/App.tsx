import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LocalTransport,
  WebRtcTransport,
  WebSocketRelayTransport,
  generateRoomCode,
  getRelayUrl,
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
import {
  clearRoomSession,
  loadHostSession,
  loadLastHostRoom,
  loadLastPeerRoom,
  loadPeerSession,
  saveHostSession,
  savePeerSession,
  type PeerSession,
} from './game/sessionStore';

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

function getTransportMode(): 'relay' | 'webrtc' {
  const mode = new URLSearchParams(window.location.search).get('transport');
  return mode === 'webrtc' ? 'webrtc' : 'relay';
}

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
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

function isRoomExists(error: unknown): boolean {
  return errorCode(error) === 'ROOM_EXISTS';
}


function randomSeed(): number {
  return Date.now() + Math.floor(Math.random() * 100000);
}

function getPeerJSOptions(): {
  host?: string;
  port?: number;
  path?: string;
  secure?: boolean;
} {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  // Public deployment uses the self-hosted PeerJS signaling server via Nginx /peerjs.
  // Local development keeps using PeerJS public cloud unless overridden.
  if (params.get('peer') === 'public' || isLocal) return {};
  const sameOriginPort = window.location.port
    ? Number(window.location.port)
    : (window.location.protocol === 'https:' ? 443 : 80);
  return {
    host: params.get('peerHost') ?? window.location.hostname,
    port: params.get('peerPort') ? Number(params.get('peerPort')) : sameOriginPort,
    path: params.get('peerPath') ?? '/peerjs',
    secure: params.get('peerSecure') ? params.get('peerSecure') === '1' : window.location.protocol === 'https:',
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const code = errorCode(error);
    switch (code) {
      case 'ROOM_NOT_FOUND':
        return '找不到该房间，请确认房间码正确且房主仍然在线。';
      case 'ROOM_EXISTS':
        return '房间码已被占用，请重试。';
      case 'HOST_OFFLINE':
        return '房主已离线，无法加入。';
      case 'ROOM_FULL':
        return '房间人数已满。';
      case 'SERVER_UNAVAILABLE':
        return 'Relay 服务暂不可用，请稍后重试。';
      case 'CONNECTION_TIMEOUT':
        return '连接超时，请确认网络或 Relay 服务可用。';
      case 'PROTOCOL_ERROR':
        return '网络协议错误，请刷新页面重试。';
      default:
        return error.message;
    }
  }
  return '发生未知错误，请重试。';
}

async function createHostClient(nickname: string): Promise<{ client: HostGameClient; peerId: string }> {
  let lastError: unknown = new Error('创建房间失败，请重试。');
  const transportMode = getTransportMode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomId = generateRoomCode();
    const controller = new HostGameController({ roomId, hostPlayerId: makePlayerId(), seed: randomSeed() });
    controller.addPlayer(nickname);
    const peerId = makePeerId('host');

    const transport =
      transportMode === 'webrtc'
        ? new WebRtcTransport({ role: 'host', peerId: roomId, ...getPeerJSOptions() })
        : new WebSocketRelayTransport({
            role: 'host',
            roomId,
            clientId: peerId,
            url: getRelayUrl(),
          });

    const networkHost = new NetworkHost(controller, transport);
    try {
      await transport.connect();
      return { client: new HostGameClient(controller, networkHost, transport), peerId };
    } catch (error) {
      lastError = error;
      networkHost.destroy();
      transport.disconnect();
      if (transportMode === 'webrtc') {
        if (isUnavailableId(error)) continue;
      } else if (isRoomExists(error)) {
        continue;
      }
      break;
    }
  }
  throw lastError;
}

async function createPeerClient(
  nickname: string,
  roomId: string,
  savedSession?: PeerSession | null,
): Promise<{ client: PeerGameClient; peerId: string }> {
  const normalizedRoomId = roomId.trim().toUpperCase();
  const transportMode = getTransportMode();
  const peerId = savedSession?.peerId ?? makePeerId('guest');
  let lastError: unknown = new Error('加入房间失败');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const transport =
      transportMode === 'webrtc'
        ? new WebRtcTransport({ role: 'peer', peerId, hostPeerId: normalizedRoomId, ...getPeerJSOptions() })
        : new WebSocketRelayTransport({
            role: 'peer',
            roomId: normalizedRoomId,
            clientId: peerId,
            url: getRelayUrl(),
          });

    try {
      await withTimeout(transport.connect(), 12000);
      const networkPeer = new NetworkPeer(transport, peerId);
      const peerClient = new PeerGameClient(networkPeer, normalizedRoomId);
      await peerClient.connect(nickname, savedSession?.playerId ?? undefined);
      return { client: peerClient, peerId };
    } catch (error) {
      lastError = error;
      transport.disconnect();
      if (errorCode(error) !== 'ROOM_NOT_FOUND') throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function restoreHostClient(
  session: { roomId: string; nickname: string; playerId: string; peerId: string },
  snapshot: ReturnType<HostGameController['snapshot']>,
): Promise<{ client: HostGameClient; peerId: string }> {
  const controller = HostGameController.fromSnapshot(snapshot);
  const transportMode = getTransportMode();
  let lastError: unknown = new Error('恢复房间失败');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const transport =
      transportMode === 'webrtc'
        ? new WebRtcTransport({ role: 'host', peerId: session.roomId, ...getPeerJSOptions() })
        : new WebSocketRelayTransport({
            role: 'host',
            roomId: session.roomId,
            clientId: session.peerId,
            url: getRelayUrl(),
          });
    const networkHost = new NetworkHost(controller, transport);
    try {
      await transport.connect();
      return { client: new HostGameClient(controller, networkHost, transport), peerId: session.peerId };
    } catch (error) {
      lastError = error;
      networkHost.destroy();
      transport.disconnect();
      if (!isRoomExists(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [initialRoom, setInitialRoom] = useState<string | null>(null);
  const [roomParamReady, setRoomParamReady] = useState(false);
  const [client, setClient] = useState<GameClient | null>(null);
  const debugMode = useMemo(isDebugMode, []);
  const reconnectingRef = useRef(false);

  useEffect(() => {
    setInitialRoom(readRoomParam());
    setRoomParamReady(true);
  }, []);

  useEffect(() => {
    if (!client) return;
    return client.subscribe(() => {
      if (client instanceof HostGameClient) {
        const saved = loadHostSession(client.roomId);
        if (saved) {
          saveHostSession(saved.session, client.controller.snapshot());
        }
      }
      if (client.lastError && !reconnectingRef.current) {
        reconnectingRef.current = true;
        window.setTimeout(() => {
          void client.reconnect?.().catch(() => undefined).finally(() => {
            reconnectingRef.current = false;
          });
        }, 800);
      }
      const view = client.getView();
      if (view && view.phase !== 'LOBBY' && view.phase !== 'SETUP') {
        setScreen((prev) => {
          if (prev.name === 'lobby' || prev.name === 'connecting') {
            return {
              name: 'game',
              roomId: client.roomId,
              nickname: prev.name === 'lobby' ? prev.nickname : '',
              playerId: prev.name === 'lobby' ? prev.playerId : (client.playerId ?? ''),
              isHost: client.isHost,
            };
          }
          return prev;
        });
      }
    });
  }, [client]);

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
      const { client: hostClient, peerId } = await createHostClient(nickname);
      saveHostSession(
        {
          roomId: hostClient.roomId,
          role: 'host',
          nickname,
          playerId: hostClient.playerId,
          peerId,
        },
        hostClient.controller.snapshot(),
      );
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
      const savedSession = loadPeerSession(normalizedRoomId);
      const { client: peerClient, peerId } = await createPeerClient(nickname, normalizedRoomId, savedSession);
      savePeerSession({
        roomId: normalizedRoomId,
        role: 'peer',
        nickname,
        playerId: peerClient.playerId ?? '',
        peerId,
        sessionId: peerClient.sessionId,
      });
      setClient(peerClient);
      const peerPhase = peerClient.phase;
      setScreen(
        peerPhase !== 'LOBBY' && peerPhase !== 'SETUP'
          ? {
              name: 'game',
              roomId: normalizedRoomId,
              nickname,
              playerId: peerClient.playerId ?? '',
              isHost: false,
            }
          : {
              name: 'lobby',
              roomId: normalizedRoomId,
              nickname,
              playerId: peerClient.playerId ?? '',
              isHost: false,
            },
      );
    } catch (error) {
      setScreen({ name: 'error', message: errorMessage(error) });
    }
  };

  const handleLeave = () => {
    const roomId = client?.roomId;
    client?.disconnect();
    setClient(null);
    if (roomId) clearRoomSession(roomId);
    setScreen({ name: 'home' });
  };

  const handleBackToRoom = () => {
    if (!client) return;
    const roomId = client.roomId;
    const nickname = screen.name === 'game' ? screen.nickname : '';
    const playerId = client.playerId ?? '';
    const isHost = client.isHost;
    client.handleCommand({ type: 'RESTART_GAME', playerId });
    setScreen({ name: 'lobby', roomId, nickname, playerId, isHost });
  };

  const handleRematch = () => {
    if (!client) return;
    const playerId = client.playerId ?? '';
    client.handleCommand({ type: 'REMATCH', playerId });
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

  useEffect(() => {
    if (debugMode || !roomParamReady || screen.name !== 'home' || client) return;
    const roomToRestore = (initialRoom ?? loadLastHostRoom() ?? loadLastPeerRoom())?.trim().toUpperCase();
    if (!roomToRestore) return;

    let cancelled = false;
    const run = async () => {
      const hostSaved = loadHostSession(roomToRestore);
      if (hostSaved) {
        setScreen({ name: 'connecting', message: '正在恢复房间…' });
        try {
          const { client: hostClient } = await restoreHostClient(hostSaved.session, hostSaved.snapshot);
          if (cancelled) {
            hostClient.disconnect();
            return;
          }
          setClient(hostClient);
          const phase = hostClient.controller.phase;
          setScreen(
            phase !== 'LOBBY' && phase !== 'SETUP'
              ? {
                  name: 'game',
                  roomId: hostClient.roomId,
                  nickname: hostSaved.session.nickname,
                  playerId: hostClient.playerId,
                  isHost: true,
                }
              : {
                  name: 'lobby',
                  roomId: hostClient.roomId,
                  nickname: hostSaved.session.nickname,
                  playerId: hostClient.playerId,
                  isHost: true,
                },
          );
        } catch (error) {
          if (!cancelled) setScreen({ name: 'error', message: errorMessage(error) });
        }
        return;
      }

      const peerSaved = loadPeerSession(roomToRestore);
      if (peerSaved) {
        setScreen({ name: 'connecting', message: `正在重新连接房间 ${roomToRestore}…` });
        await handleJoin(peerSaved.nickname, roomToRestore);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // Intentionally run only when the room parameter or debug mode changes; the
    // screen/client guards prevent duplicate restores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRoom, roomParamReady, debugMode]);

  if (screen.name === 'home') {
    return (
      <HomeScreen
        initialRoom={initialRoom ?? (roomParamReady ? loadLastHostRoom() ?? loadLastPeerRoom() ?? undefined : undefined)}
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
      onBackToRoom={handleBackToRoom}
      onRematch={handleRematch}
    />
  );
}

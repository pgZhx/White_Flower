import type { HostGameControllerSnapshot } from './HostGameController';

export interface PeerSession {
  roomId: string;
  role: 'peer';
  nickname: string;
  playerId: string | null;
  peerId: string;
  sessionId: string;
}

export interface HostSession {
  roomId: string;
  role: 'host';
  nickname: string;
  playerId: string;
  peerId: string;
}

export type SavedRoomSession = PeerSession | HostSession;

const PEER_PREFIX = 'white-flower:peer:';
const HOST_PREFIX = 'white-flower:host:';
const LAST_HOST_KEY = 'white-flower:last-host-room';
const LAST_PEER_KEY = 'white-flower:last-peer-room';

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable (private mode / quota); persistence is best-effort.
  }
}

function safeSessionGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Automatic restore is best-effort when session storage is unavailable.
  }
}

function safeSessionRemove(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

export function savePeerSession(session: PeerSession): void {
  safeSet(`${PEER_PREFIX}${session.roomId}`, JSON.stringify(session));
  safeSessionSet(LAST_PEER_KEY, session.roomId);
  safeSessionRemove(LAST_HOST_KEY);
  safeRemove(LAST_PEER_KEY);
}

export function loadPeerSession(roomId: string): PeerSession | null {
  const raw = safeGet(`${PEER_PREFIX}${roomId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PeerSession;
    if (parsed.role === 'peer' && parsed.roomId === roomId) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function clearPeerSession(roomId: string): void {
  safeRemove(`${PEER_PREFIX}${roomId}`);
  if (loadLastPeerRoom() === roomId) safeSessionRemove(LAST_PEER_KEY);
  safeRemove(LAST_PEER_KEY);
}

export function saveHostSession(session: HostSession, snapshot: HostGameControllerSnapshot): void {
  safeSet(`${HOST_PREFIX}${session.roomId}`, JSON.stringify({ session, snapshot }));
  safeSessionSet(LAST_HOST_KEY, session.roomId);
  safeSessionRemove(LAST_PEER_KEY);
  safeRemove(LAST_HOST_KEY);
}

export function loadHostSession(roomId: string): { session: HostSession; snapshot: HostGameControllerSnapshot } | null {
  const raw = safeGet(`${HOST_PREFIX}${roomId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { session: HostSession; snapshot: HostGameControllerSnapshot };
    if (parsed.session.role === 'host' && parsed.session.roomId === roomId) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function loadLastHostRoom(): string | null {
  // Remove legacy persistent markers that previously caused stale rooms to be
  // reconnected every time the browser was reopened.
  safeRemove(LAST_HOST_KEY);
  return safeSessionGet(LAST_HOST_KEY);
}

export function loadLastPeerRoom(): string | null {
  safeRemove(LAST_PEER_KEY);
  return safeSessionGet(LAST_PEER_KEY);
}

export function clearHostSession(roomId: string): void {
  safeRemove(`${HOST_PREFIX}${roomId}`);
  if (loadLastHostRoom() === roomId) safeSessionRemove(LAST_HOST_KEY);
  safeRemove(LAST_HOST_KEY);
}

export function clearRoomSession(roomId: string): void {
  clearPeerSession(roomId);
  clearHostSession(roomId);
}

export function loadRoomSession(roomId: string): SavedRoomSession | null {
  const peer = loadPeerSession(roomId);
  if (peer) return peer;
  const host = loadHostSession(roomId);
  if (host) return host.session;
  return null;
}

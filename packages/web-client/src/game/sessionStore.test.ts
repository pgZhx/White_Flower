import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPeerSession,
  loadLastPeerRoom,
  loadPeerSession,
  savePeerSession,
} from './sessionStore';

describe('sessionStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('remembers the active peer room only for the current browser tab', () => {
    savePeerSession({
      roomId: 'ABC',
      role: 'peer',
      nickname: 'Alice',
      playerId: 'player-1',
      peerId: 'peer-1',
      sessionId: 'session-1',
    });

    expect(loadLastPeerRoom()).toBe('ABC');
    expect(loadPeerSession('ABC')?.nickname).toBe('Alice');

    clearPeerSession('ABC');
    expect(loadLastPeerRoom()).toBeNull();
    expect(loadPeerSession('ABC')).toBeNull();
  });

  it('ignores legacy last-room markers stored persistently', () => {
    window.localStorage.setItem('white-flower:last-peer-room', 'STALE');
    window.localStorage.setItem('white-flower:last-host-room', 'OLDHOST');

    expect(loadLastPeerRoom()).toBeNull();
    expect(window.localStorage.getItem('white-flower:last-peer-room')).toBeNull();
  });
});

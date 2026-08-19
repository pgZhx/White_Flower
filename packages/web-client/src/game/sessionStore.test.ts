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
  });

  it('remembers the last peer room so a peer refresh can restore without a URL room code', () => {
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
});

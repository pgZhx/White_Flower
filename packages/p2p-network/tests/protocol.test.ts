import { describe, expect, it } from 'vitest';
import { createMessage } from '../src/index.js';
import type { JoinRequest, LobbySnapshot, RoomState } from '../src/index.js';

describe('protocol', () => {
  it('creates a versioned message with messageId', () => {
    const msg = createMessage<JoinRequest>('JOIN_REQUEST', {
      roomId: 'ABC123',
      nickname: 'Alice',
    });
    expect(msg.version).toBe(1);
    expect(msg.type).toBe('JOIN_REQUEST');
    expect(msg.messageId).toMatch(/^msg_/);
    expect(msg.nickname).toBe('Alice');
  });

  it('creates lobby snapshot payload', () => {
    const room: RoomState = {
      roomId: 'ABC123',
      hostPlayerId: 'p1',
      players: [],
      status: 'LOBBY',
    };
    const msg = createMessage<LobbySnapshot>('LOBBY_SNAPSHOT', { payload: { roomState: room } });
    expect(msg.type).toBe('LOBBY_SNAPSHOT');
    expect(msg.payload.roomState.roomId).toBe('ABC123');
  });
});

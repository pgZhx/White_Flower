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

  it('creates a ready command with session id', () => {
    const msg = createMessage<import('../src/index.js').ReadyCommand>('READY_COMMAND', {
      roomId: 'ABC123',
      sessionId: 'session-1',
      ready: true,
    });
    expect(msg.type).toBe('READY_COMMAND');
    expect(msg.ready).toBe(true);
    expect(msg.sessionId).toBe('session-1');
  });

  it('generates room codes from unambiguous character set', async () => {
    const { generateRoomCode } = await import('../src/index.js');
    const code = generateRoomCode(6);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
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

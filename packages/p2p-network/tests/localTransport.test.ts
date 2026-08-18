import { describe, expect, it } from 'vitest';
import { LocalTransport, createMessage } from '../src/index.js';
import type { JoinRequest } from '../src/index.js';

describe('LocalTransport', () => {
  it('delivers messages between linked peers asynchronously', async () => {
    const a = new LocalTransport();
    const b = new LocalTransport();
    a.link(b);
    b.link(a);

    const received: string[] = [];
    b.onMessage((msg) => received.push(msg.type));

    a.send(createMessage<JoinRequest>('JOIN_REQUEST', { roomId: 'R1', nickname: 'Bob' }));
    await Promise.resolve();
    await Promise.resolve();

    expect(received).toEqual(['JOIN_REQUEST']);
  });

  it('can unsubscribe', async () => {
    const a = new LocalTransport();
    const b = new LocalTransport();
    a.link(b);
    b.link(a);

    const received: string[] = [];
    const unsub = b.onMessage((msg) => received.push(msg.type));
    unsub();
    a.send(createMessage<JoinRequest>('JOIN_REQUEST', { roomId: 'R1', nickname: 'Bob' }));
    await Promise.resolve();
    expect(received).toEqual([]);
  });
});

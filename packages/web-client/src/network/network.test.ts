import { describe, expect, it } from 'vitest';
import { LocalTransport } from '@rose-blade/p2p-network';
import { HostGameController } from '../game/HostGameController';
import { NetworkHost } from './NetworkHost';
import { NetworkPeer } from './NetworkPeer';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('NetworkHost + NetworkPeer over LocalTransport', () => {
  it('joins, broadcasts lobby, and sends personalized view after start', async () => {
    const hostTransport = new LocalTransport();
    const peerTransport = new LocalTransport();
    hostTransport.link(peerTransport);
    peerTransport.link(hostTransport);

    const controller = new HostGameController({ roomId: 'ROOM1', hostPlayerId: 'host-id' });
    controller.addPlayer('Host');
    const host = new NetworkHost(controller, hostTransport);
    const peer = new NetworkPeer(peerTransport, 'peer-id');
    peer.join('ROOM1', 'Alice');
    await flush();

    expect(peer.state.room?.players.length).toBe(2);
    expect(peer.state.playerId).toBeTruthy();

    // Add more local simulated players and ready them all, then start.
    controller.addPlayer('Bob');
    controller.addPlayer('Carol');
    controller.addPlayer('Dave');
    controller.addPlayer('Eve');
    for (const p of controller.room.players) {
      controller.setReady(p.id, true);
    }
    controller.startGame();
    await flush();

    expect(peer.state.view).not.toBeNull();
    expect(peer.state.view?.phase).toBe('NIGHT_RECOGNITION');
  });
});

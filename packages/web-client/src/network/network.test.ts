import { describe, expect, it } from 'vitest';
import type { MultiplayerTransport, NetworkMessage, Unsubscribe } from '@rose-blade/p2p-network';
import { HostGameController } from '../game/HostGameController';
import { NetworkHost } from './NetworkHost';
import { NetworkPeer } from './NetworkPeer';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

interface TestHub {
  transports: Map<string, TestTransport>;
}

class TestTransport implements MultiplayerTransport {
  readonly id: string;
  private readonly hub: TestHub;
  private readonly hostId: string | undefined;
  private handlers = new Set<(message: NetworkMessage, fromPeerId?: string) => void>();
  private connectedHandlers = new Set<(peerId: string) => void>();
  private disconnectedHandlers = new Set<(peerId: string) => void>();

  constructor(id: string, hub: TestHub, hostId?: string) {
    this.id = id;
    this.hub = hub;
    this.hostId = hostId;
    hub.transports.set(id, this);
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  sendTo(peerId: string, message: NetworkMessage): void {
    const target = this.hub.transports.get(peerId);
    if (!target) throw new Error(`No test transport for ${peerId}`);
    queueMicrotask(() => target.receive(message, this.id));
  }

  send(message: NetworkMessage): void {
    if (!this.hostId) throw new Error('Host test transport cannot send without target');
    this.sendTo(this.hostId, message);
  }

  broadcast(message: NetworkMessage): void {
    for (const [id, target] of this.hub.transports) {
      if (id === this.id) continue;
      queueMicrotask(() => target.receive(message, this.id));
    }
  }

  receive(message: NetworkMessage, fromPeerId?: string): void {
    for (const handler of this.handlers) handler(message, fromPeerId);
  }

  onMessage(handler: (message: NetworkMessage, fromPeerId?: string) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  onPeerConnected(handler: (peerId: string) => void): Unsubscribe {
    this.connectedHandlers.add(handler);
    return () => {
      this.connectedHandlers.delete(handler);
    };
  }

  onPeerDisconnected(handler: (peerId: string) => void): Unsubscribe {
    this.disconnectedHandlers.add(handler);
    return () => {
      this.disconnectedHandlers.delete(handler);
    };
  }

  disconnect(): void {
    this.handlers.clear();
  }

  emitPeerDisconnected(peerId: string): void {
    for (const handler of this.disconnectedHandlers) handler(peerId);
  }
}

function createHub(): TestHub {
  return { transports: new Map() };
}

async function createHostWithPeers(nicknames: string[]) {
  const hub = createHub();
  const hostTransport = new TestTransport('host', hub);
  const controller = new HostGameController({ roomId: 'ROOM1', hostPlayerId: 'host-player', seed: 7 });
  controller.addPlayer('Host');
  const host = new NetworkHost(controller, hostTransport);

  const peers: Array<{ transport: TestTransport; peer: NetworkPeer; peerId: string }> = [];
  for (let i = 0; i < nicknames.length; i += 1) {
    const nickname = nicknames[i]!;
    const peerId = `peer-${i + 1}`;
    const peerTransport = new TestTransport(peerId, hub, 'host');
    const peer = new NetworkPeer(peerTransport, peerId);
    peer.join('ROOM1', nickname);
    await flush();
    peers.push({ transport: peerTransport, peer, peerId });
  }
  return { hub, hostTransport, controller, host, peers };
}

describe('NetworkHost + NetworkPeer over in-memory transport', () => {
  it('joins, broadcasts lobby, and sends personalized view after start', async () => {
    const { controller, peers } = await createHostWithPeers(['Alice']);
    expect(peers[0]!.peer.state.room?.players.length).toBe(2);
    expect(peers[0]!.peer.state.playerId).toBeTruthy();

    controller.addPlayer('Bob');
    controller.addPlayer('Carol');
    controller.addPlayer('Dave');
    controller.addPlayer('Eve');
    for (const p of controller.room.players) {
      controller.setReady(p.id, true);
    }
    controller.startGame();
    await flush();

    expect(peers[0]!.peer.state.view).not.toBeNull();
    expect(peers[0]!.peer.state.view?.phase).toBe('NIGHT_RECOGNITION');
  });

  it('maps peers to players and ignores spoofed playerId in commands', async () => {
    const { controller, peers } = await createHostWithPeers(['Alice']);
    const alice = peers[0]!;
    const alicePlayerId = alice.peer.state.playerId!;
    const hostPlayerId = controller.hostPlayerId;

    // Alice sends a READY command while pretending to be the host.
    alice.peer.sendCommand({ type: 'READY', playerId: hostPlayerId, ready: true } as never);
    await flush();

    const alicePlayer = controller.room.players.find((p) => p.id === alicePlayerId);
    const hostPlayer = controller.room.players.find((p) => p.id === hostPlayerId);
    expect(alicePlayer?.ready).toBe(true);
    expect(hostPlayer?.ready).toBe(false);
  });

  it('routes a peer game command through the host engine', async () => {
    const { controller, peers } = await createHostWithPeers(['Alice']);
    controller.addPlayer('Bob');
    controller.addPlayer('Carol');
    controller.addPlayer('Dave');
    controller.addPlayer('Eve');
    for (const p of controller.room.players) controller.setReady(p.id, true);
    controller.startGame();
    await flush();

    peers[0]!.peer.sendCommand({ type: 'CONFIRM_IDENTITY' });
    await flush();

    // Confirm the remaining local players; the peer's earlier command should count.
    for (const p of controller.room.players) controller.confirmIdentity(p.id);
    expect(controller.phase).toBe('NIGHT_DOUBLE_KNIFE');
    for (const p of controller.room.players) {
      controller.confirmIdentity(p.id);
    }
    expect(controller.phase).toBe('FIRST_SPEAKING_PHASE');
  });

  it('does not allow a peer to start the game', async () => {
    const { controller, peers } = await createHostWithPeers(['Alice']);
    controller.addPlayer('Bob');
    controller.addPlayer('Carol');
    controller.addPlayer('Dave');
    controller.addPlayer('Eve');
    for (const p of controller.room.players) controller.setReady(p.id, true);

    peers[0]!.peer.sendCommand({ type: 'START_GAME' } as never);
    await flush();

    expect(controller.phase).toBe('LOBBY');
    expect(peers[0]!.peer.state.lastError).toBe('只有房主可以开始游戏');
  });

  it('supports READY_COMMAND and keeps lobby synchronized', async () => {
    const { controller, peers } = await createHostWithPeers(['Alice', 'Bob']);
    const alice = peers[0]!;
    const bob = peers[1]!;

    alice.peer.setReady(true);
    bob.peer.setReady(true);
    await flush();

    expect(controller.room.players.find((p) => p.nickname === 'Alice')?.ready).toBe(true);
    expect(controller.room.players.find((p) => p.nickname === 'Bob')?.ready).toBe(true);
  });

  it('routes voice signals and status through the host', async () => {
    const { controller, host, peers } = await createHostWithPeers(['Alice', 'Bob']);
    const alice = peers[0]!.peer;
    const bob = peers[1]!.peer;
    const aliceId = alice.state.playerId!;

    bob.sendVoiceSignal(aliceId, { kind: 'ICE', data: { candidate: 'candidate-1' } });
    await flush();

    const signals: Array<{ fromPlayerId: string; kind: string }> = [];
    alice.onVoiceSignal((fromPlayerId, signal) => signals.push({ fromPlayerId, kind: signal.kind }));

    const statuses: Array<{ playerId: string; enabled: boolean }> = [];
    host.onVoiceStatus((playerId, enabled) => statuses.push({ playerId, enabled }));
    bob.sendVoiceStatus(true);
    await flush();

    expect(signals).toEqual([{ fromPlayerId: bob.state.playerId, kind: 'ICE' }]);
    expect(statuses).toEqual([{ playerId: bob.state.playerId, enabled: true }]);
    expect(alice.state.voiceStatuses[bob.state.playerId!]).toBe(true);
    expect(controller.room.players).toHaveLength(3);
  });

  it('buffers voice signals addressed to the host until its voice room is ready', async () => {
    const { controller, host, peers } = await createHostWithPeers(['Alice']);
    const alice = peers[0]!.peer;
    alice.sendVoiceSignal(controller.hostPlayerId, {
      kind: 'OFFER',
      data: { type: 'offer', sdp: 'm=audio 9 UDP/TLS/RTP/SAVPF 111' },
    });
    await flush();

    const received: Array<{ fromPlayerId: string; kind: string }> = [];
    host.onVoiceSignal((fromPlayerId, signal) => received.push({ fromPlayerId, kind: signal.kind }));

    expect(received).toEqual([{ fromPlayerId: alice.state.playerId, kind: 'OFFER' }]);
  });

  it('rejects duplicate nicknames, full rooms, and started games', async () => {
    // Duplicate nickname.
    const hub = createHub();
    const hostTransport = new TestTransport('host', hub);
    const controller = new HostGameController({ roomId: 'ROOM1', hostPlayerId: 'host-player', seed: 7 });
    controller.addPlayer('Host');
    new NetworkHost(controller, hostTransport);

    const peer1Transport = new TestTransport('peer-dup-1', hub, 'host');
    const peer1 = new NetworkPeer(peer1Transport, 'peer-dup-1');
    peer1.join('ROOM1', 'Bob');
    await flush();
    const peer2Transport = new TestTransport('peer-dup-2', hub, 'host');
    const peer2 = new NetworkPeer(peer2Transport, 'peer-dup-2');
    peer2.join('ROOM1', 'Bob');
    await flush();
    expect(peer2.state.lastError).toBe('昵称已被使用');

    // Room full: host + 9 local players.
    const fullHub = createHub();
    const fullHostTransport = new TestTransport('host-full', fullHub);
    const fullController = new HostGameController({ roomId: 'FULL', hostPlayerId: 'host-full-player', seed: 7 });
    fullController.addPlayer('Host');
    for (let i = 0; i < 9; i += 1) fullController.addPlayer(`Local${i + 1}`);
    new NetworkHost(fullController, fullHostTransport);
    const fullPeerTransport = new TestTransport('peer-full', fullHub, 'host-full');
    const fullPeer = new NetworkPeer(fullPeerTransport, 'peer-full');
    fullPeer.join('FULL', 'Charlie');
    await flush();
    expect(fullPeer.state.lastError).toBe('房间已满');

    // Started game.
    const startController = new HostGameController({ roomId: 'ROOM2', hostPlayerId: 'host2', seed: 3 });
    startController.addLocalPlayers(5);
    for (const p of startController.room.players) startController.setReady(p.id, true);
    startController.startGame();
    const startHub = createHub();
    const startHostTransport = new TestTransport('host2', startHub);
    new NetworkHost(startController, startHostTransport);
    const lateTransport = new TestTransport('peer-late', startHub, 'host2');
    const latePeer = new NetworkPeer(lateTransport, 'peer-late');
    latePeer.join('ROOM2', 'Late');
    await flush();
    expect(latePeer.state.lastError).toBe('游戏已经开始，无法加入');
  });

  it('marks disconnected peers so they can reconnect', async () => {
    const { hostTransport, controller, peers } = await createHostWithPeers(['Alice', 'Bob']);
    expect(controller.room.players.length).toBe(3);
    hostTransport.emitPeerDisconnected(peers[0]!.peerId);
    await flush();
    expect(controller.room.players.map((p) => p.nickname)).toEqual(['Host', 'Alice', 'Bob']);
    expect(controller.room.players.find((p) => p.nickname === 'Alice')?.connected).toBe(false);
  });

  it('restores a saved player seat even when the room already has ten players', async () => {
    const hub = createHub();
    const hostTransport = new TestTransport('host-full-restore', hub);
    const controller = new HostGameController({ roomId: 'FULLRESTORE', hostPlayerId: 'host-player', seed: 7 });
    controller.addPlayer('Host');
    for (let index = 0; index < 8; index += 1) controller.addPlayer(`Local${index + 1}`);
    new NetworkHost(controller, hostTransport);

    const originalTransport = new TestTransport('peer-original', hub, 'host-full-restore');
    const originalPeer = new NetworkPeer(originalTransport, 'peer-original');
    originalPeer.join('FULLRESTORE', 'Alice');
    await flush();
    const savedPlayerId = originalPeer.state.playerId!;
    expect(controller.room.players).toHaveLength(10);

    hostTransport.emitPeerDisconnected('peer-original');
    const restoredTransport = new TestTransport('peer-restored', hub, 'host-full-restore');
    const restoredPeer = new NetworkPeer(restoredTransport, 'peer-restored');
    restoredPeer.join('FULLRESTORE', 'Alice', savedPlayerId);
    await flush();

    expect(restoredPeer.state.playerId).toBe(savedPlayerId);
    expect(restoredPeer.state.lastError).toBeNull();
    expect(controller.room.players).toHaveLength(10);
    expect(controller.room.players.find((player) => player.id === savedPlayerId)?.connected).toBe(true);
  });

  it('lets the host remove a player and immediately releases the nickname', async () => {
    const { hub, host, controller, peers } = await createHostWithPeers(['Alice', 'Bob']);
    const alice = peers[0]!.peer;
    const alicePlayerId = alice.state.playerId!;

    host.kickPlayer(alicePlayerId);
    await flush();

    expect(alice.state.lastErrorCode).toBe('KICKED');
    expect(alice.state.lastError).toBe('你已被房主移出房间。');
    expect(controller.room.players.map((player) => player.nickname)).toEqual(['Host', 'Bob']);
    expect(controller.room.players.map((player) => player.seat)).toEqual([0, 1]);

    const replacementTransport = new TestTransport('peer-replacement', hub, 'host');
    const replacement = new NetworkPeer(replacementTransport, 'peer-replacement');
    replacement.join('ROOM1', 'Alice');
    await flush();

    expect(replacement.state.playerId).toBeTruthy();
    expect(replacement.state.lastError).toBeNull();
  });
});

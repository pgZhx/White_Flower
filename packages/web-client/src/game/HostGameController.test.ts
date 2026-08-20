import { describe, expect, it } from 'vitest';
import type { GameState } from '@rose-blade/game-engine';
import { HostGameController } from './HostGameController';

const makeFivePlayerController = () => {
  const controller = new HostGameController({ roomId: 'TEST', hostPlayerId: 'p0', seed: 1 });
  controller.addLocalPlayers(5);
  for (const p of controller.room.players) {
    controller.setReady(p.id, true);
  }
  controller.startGame();
  return controller;
};

describe('HostGameController', () => {
  it('starts a 5 player game and reaches night after all confirm identity', () => {
    const controller = makeFivePlayerController();
    expect(controller.phase).toBe('NIGHT_RECOGNITION');
    for (const p of controller.room.players) {
      controller.confirmIdentity(p.id);
    }
    expect(controller.phase).toBe('NIGHT_DOUBLE_KNIFE');
    for (const p of controller.room.players) {
      controller.confirmIdentity(p.id);
    }
    expect(controller.phase).toBe('FIRST_SPEAKING_PHASE');
    for (const player of controller.room.players) {
      controller.handleCommand({ type: 'END_SPEAKING', playerId: player.id });
    }
    expect(controller.phase).toBe('INITIAL_COIN_PHASE');
  });

  it('can reset a running game back to the lobby', () => {
    const controller = makeFivePlayerController();
    expect(controller.phase).toBe('NIGHT_RECOGNITION');
    controller.restartGame();
    expect(controller.phase).toBe('LOBBY');
    expect(controller.room.status).toBe('LOBBY');
    expect(controller.room.players.every((p) => !p.ready)).toBe(true);
  });

  it('waits for every player before starting a rematch', () => {
    const controller = makeFivePlayerController();
    const internals = controller as unknown as { gameState: GameState };
    internals.gameState = {
      ...internals.gameState,
      phase: 'GAME_OVER',
      winner: 'WHITE_ROSE',
      winReason: 'TEST',
    };
    for (const player of controller.room.players.slice(0, 4)) {
      controller.rematch(player.id);
    }
    expect(controller.phase).toBe('GAME_OVER');
    expect(controller.getView(controller.room.players[0]!.id)?.rematchConfirmation).toEqual({
      required: 5,
      confirmed: 4,
      confirmedByMe: true,
      allConfirmed: false,
    });

    controller.rematch(controller.room.players[4]!.id);
    expect(controller.phase).toBe('NIGHT_RECOGNITION');
    expect(controller.room.status).toBe('PLAYING');
    expect(controller.room.players.every((p) => p.ready)).toBe(true);
  });

  it('returns personalized views that do not leak other players roles', () => {
    const controller = makeFivePlayerController();
    const view = controller.getView(controller.room.players[1]!.id);
    const json = JSON.stringify(view);
    expect(json).not.toContain('"role":"BISHOP"');
    expect(json).not.toContain('"role":"DARK_KNIFE"');
  });

  it('does not start unless all players are ready', () => {
    const controller = new HostGameController({ roomId: 'TEST', hostPlayerId: 'p0' });
    controller.addLocalPlayers(5);
    expect(controller.canStart()).toBe(false);
    expect(() => controller.startGame()).toThrow();
  });
});

describe('HostGameController full local game', () => {
  it('can reach GAME_OVER through all-pass local simulation', () => {
    const controller = makeFivePlayerController();
    const hostId = controller.room.players[0]!.id;
    for (const p of controller.room.players) {
      controller.confirmIdentity(p.id);
    }

    let safety = 0;
    while (controller.phase !== 'GAME_OVER' && safety < 100) {
      safety += 1;
      const phase = controller.phase;

      if (phase === 'NIGHT_DOUBLE_KNIFE') {
        for (const p of controller.room.players) {
          controller.confirmIdentity(p.id);
        }
        continue;
      }

      if (phase === 'FIRST_SPEAKING_PHASE' || phase === 'COIN_OWNER_SUMMARY_PHASE') {
        controller.handleCommand({ type: 'END_SPEAKING', playerId: controller.getView(hostId)!.voice.currentSpeakerId! });
        continue;
      }

      if (phase === 'ROUND_SPEAKING_PHASE') {
        const view = controller.getView(hostId)!;
        if (!view.voice.currentSpeakerId) {
          controller.handleCommand({
            type: 'SELECT_SPEAKING_ORDER',
            playerId: view.currentCoinHolderId!,
            firstPlayerId: view.players[0]!.id,
            direction: 'CLOCKWISE',
          });
        } else {
          controller.handleCommand({ type: 'END_SPEAKING', playerId: view.voice.currentSpeakerId });
        }
        continue;
      }

      if (phase === 'ROUND_MAGIC_SELECT' || phase === 'INITIAL_COIN_PHASE') {
        const view = controller.getView(hostId)!;
        const target = view.players.find((p) => p.hasCrystal)!;
        controller.handleCommand({ type: 'SELECT_COIN_TARGET', playerId: hostId, targetId: target.id });
        continue;
      }

      if (phase === 'MAGIC_RESOLUTION') {
        const view = controller.getView(hostId)!;
        const magicId = view.round!.magicNumber!;
        const caster = view.round!.crystalRevealerId!;
        const others = view.players.filter((p) => p.id !== caster && p.handCount > 0);
        let targetIds: string[] = [];
        if (magicId === 5 && others.length >= 2) {
          targetIds = [others[0]!.id, others[1]!.id];
        } else if ([1, 7, 11, 12].includes(magicId) && others.length > 0) {
          targetIds = [others[0]!.id];
        }
        controller.handleCommand({
          type: 'RESOLVE_MAGIC',
          playerId: hostId,
          targetIds,
          ...(magicId === 6 ? { magic6Choice: 'FIRST' as const } : {}),
        });
        continue;
      }

      if (phase === 'PLAYER_ACTIONS') {
        const current = controller.currentPlayerId!;
        if (controller.canPass(current)) {
          controller.handleCommand({ type: 'PASS', playerId: current });
        } else {
          const view = controller.getView(current)!;
          controller.handleCommand({ type: 'PLAY_CARD', playerId: current, card: view.me.hand[0]! });
        }
        continue;
      }

      if (phase === 'ROUND_REVEAL') {
        for (const p of controller.room.players) {
          controller.handleCommand({ type: 'REVEAL', playerId: p.id });
        }
        continue;
      }

      if (phase === 'ROUND_RESOLUTION') {
        for (const p of controller.room.players) {
          controller.handleCommand({ type: 'RESOLVE_ROUND', playerId: p.id });
        }
        continue;
      }

      if (phase === 'CHECK_VICTORY') {
        for (const p of controller.room.players) {
          controller.handleCommand({ type: 'CHECK_VICTORY', playerId: p.id });
        }
        continue;
      }

      throw new Error(`Unexpected phase in auto game: ${phase}`);
    }

    expect(controller.phase).toBe('GAME_OVER');
    expect(controller.getGameOverSnapshot()?.winner).toBeTruthy();
  });
});

describe('HostGameController player ids', () => {
  it('uses hostPlayerId for the first local player', () => {
    const controller = new HostGameController({ roomId: 'R', hostPlayerId: 'host-abc' });
    const host = controller.addPlayer('Me');
    expect(host.id).toBe('host-abc');
    expect(host.isHost).toBe(true);
  });
});

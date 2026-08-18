import { describe, expect, it } from 'vitest';
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
    expect(controller.phase).toBe('ROUND_MAGIC_SELECT');
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

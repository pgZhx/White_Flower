import type { Card, GameState, RandomProvider } from '../types.js';
import { startGame as startGameSetup } from './setup.js';
import { performNightRecognition, performDoubleKnifeNight } from './night.js';
import {
  selectCoinTarget,
  resolveCurrentMagic,
  submitAction,
  submitMagic10Target,
  submitMagic10Replacement,
  revealRound,
  resolveRound,
  checkVictoryAndAdvance,
} from './round.js';
import { buildPlayerView, type ClientView } from './view.js';

export class GameEngine {
  private state: GameState;

  constructor(state: GameState) {
    this.state = state;
  }

  getState(): GameState {
    return this.state;
  }

  getView(viewerId: string): ClientView {
    return buildPlayerView(this.state, viewerId);
  }

  startGame(random: RandomProvider): void {
    this.state = startGameSetup(this.state, random);
  }

  performNightRecognition(): void {
    this.state = performNightRecognition(this.state);
  }

  performDoubleKnifeNight(): void {
    this.state = performDoubleKnifeNight(this.state);
  }

  selectCoinTarget(targetId: string): void {
    this.state = selectCoinTarget(this.state, targetId);
  }

  resolveMagic(targetIds: string[], random: RandomProvider, magic6Choice?: 'FIRST' | 'LAST'): void {
    this.state = resolveCurrentMagic(this.state, targetIds, random, magic6Choice);
  }

  submitPlayerAction(playerId: string, action: 'PLAY' | 'PASS', card: Card | null, random: RandomProvider): void {
    this.state = submitAction(this.state, playerId, action, card, random);
  }

  submitMagic10Target(casterId: string, targetId: string | null): void {
    this.state = submitMagic10Target(this.state, casterId, targetId);
  }

  submitMagic10Replacement(targetId: string, replacementCard: Card): void {
    this.state = submitMagic10Replacement(this.state, targetId, replacementCard);
  }

  revealRound(random: RandomProvider): void {
    this.state = revealRound(this.state, random);
  }

  resolveRound(): void {
    this.state = resolveRound(this.state);
  }

  checkVictoryAndAdvance(): void {
    this.state = checkVictoryAndAdvance(this.state);
  }
}

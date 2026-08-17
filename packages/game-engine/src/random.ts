import type { RandomProvider } from './types.js';

export class SeededRandom implements RandomProvider {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  nextInt(minInclusive: number, maxExclusive: number): number {
    if (maxExclusive <= minInclusive) {
      throw new Error('maxExclusive must be greater than minInclusive');
    }
    const range = maxExclusive - minInclusive;
    return minInclusive + Math.floor(this.next() * range);
  }

  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = this.nextInt(0, i + 1);
      const tmp = result[i];
      if (tmp === undefined || result[j] === undefined) {
        throw new Error('Unexpected undefined in shuffle');
      }
      result[i] = result[j] as T;
      result[j] = tmp;
    }
    return result;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    return items[this.nextInt(0, items.length)] as T;
  }

  private next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export const createRandom = (seed: number): RandomProvider => new SeededRandom(seed);

import { describe, expect, it } from 'vitest';
import { performNightRecognition } from '../src/index.js';
import { createStateWithRoles, playerById } from './helpers.js';

describe('Night Knowledge', () => {
  it('WHITE_ROSE, BISHOP, DOUBLE_KNIFE, GREAT_SWORD see the eyes-open player set', () => {
    const state = createStateWithRoles([
      'WHITE_ROSE',
      'BISHOP',
      'BELIEVER',
      'GREAT_SWORD',
      'DOUBLE_KNIFE',
      'DARK_KNIFE',
    ]);
    const night = performNightRecognition(state);
    const expected = ['p0', 'p1', 'p3', 'p4'];

    for (const id of expected) {
      expect(playerById(night, id).nightRecognition).toEqual(expected);
    }
  });

  it('BELIEVER and DARK_KNIFE do not get night recognition', () => {
    const state = createStateWithRoles([
      'WHITE_ROSE',
      'BISHOP',
      'BELIEVER',
      'GREAT_SWORD',
      'DOUBLE_KNIFE',
      'DARK_KNIFE',
    ]);
    const night = performNightRecognition(state);
    expect(playerById(night, 'p2').nightRecognition).toBeNull();
    expect(playerById(night, 'p5').nightRecognition).toBeNull();
  });

  it('night recognition does not reveal individual roles', () => {
    const state = createStateWithRoles([
      'WHITE_ROSE',
      'BISHOP',
      'BELIEVER',
      'DOUBLE_KNIFE',
      'DARK_KNIFE',
    ]);
    const night = performNightRecognition(state);
    const view = playerById(night, 'p0').nightRecognition;
    expect(view).toEqual(['p0', 'p1', 'p3']);
  });
});

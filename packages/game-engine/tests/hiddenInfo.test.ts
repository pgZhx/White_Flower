import { describe, expect, it } from 'vitest';
import { buildPlayerView, performNightRecognition, resolveMagicNow, SeededRandom } from '../src/index.js';
import { createStateWithRoles } from './helpers.js';

const random = new SeededRandom(7);

describe('Hidden Information', () => {
  it('does not leak other players role, faction, hand, or crystal to a viewer', () => {
    const state = createStateWithRoles([
      'WHITE_ROSE',
      'BISHOP',
      'BELIEVER',
      'DOUBLE_KNIFE',
      'DARK_KNIFE',
    ]);
    const view = buildPlayerView(state, 'p0');
    const json = JSON.stringify(view);

    expect(json).not.toContain('"role":"BISHOP"');
    expect(json).not.toContain('"role":"BELIEVER"');
    expect(json).not.toContain('"role":"DOUBLE_KNIFE"');
    expect(json).not.toContain('"role":"DARK_KNIFE"');
    expect(json).not.toContain('"faction":"BLOOD_BLADE"');
    expect(json).not.toContain('"hand":["BISHOP","BELIEVER","GHOST"]');
    expect(json).not.toContain('"crystal":2');
    expect(json).not.toContain('"crystal":3');
  });

  it('does not leak night recognition of other players', () => {
    const state = performNightRecognition(createStateWithRoles([
      'WHITE_ROSE',
      'BISHOP',
      'BELIEVER',
      'DOUBLE_KNIFE',
      'DARK_KNIFE',
    ]));
    const view = buildPlayerView(state, 'p2');
    const json = JSON.stringify(view);
    // p2 is BELIEVER and should not see any nightRecognition array at all.
    expect(json).not.toContain('"nightRecognition":["p0","p1","p3"]');
  });

  it('does not leak Magic 9 information to non-DARK_KNIFE players', () => {
    let state = createStateWithRoles([
      'WHITE_ROSE',
      'BISHOP',
      'BELIEVER',
      'DOUBLE_KNIFE',
      'DARK_KNIFE',
    ]);
    state = resolveMagicNow(state, 9, 'p2', [], random);
    const view = buildPlayerView(state, 'p0');
    const json = JSON.stringify(view);
    expect(json).not.toContain('"magic9Reveal":{');
  });

  it('does not leak night recognition through the public event log', () => {
    const state = performNightRecognition(createStateWithRoles([
      'WHITE_ROSE',
      'BISHOP',
      'BELIEVER',
      'DOUBLE_KNIFE',
      'DARK_KNIFE',
    ]));
    const view = buildPlayerView(state, 'p2');
    const json = JSON.stringify(view);
    expect(json).not.toContain('"nightPlayerIds"');
    expect(json).not.toContain('["p0","p1","p3"]');
  });

  it('does not leak Magic 11 seen card to other players', () => {
    let state = createStateWithRoles([
      'WHITE_ROSE',
      'BISHOP',
      'BELIEVER',
      'DOUBLE_KNIFE',
      'DARK_KNIFE',
    ]);
    state = resolveMagicNow(state, 11, 'p0', ['p1'], random);
    const view = buildPlayerView(state, 'p2');
    const json = JSON.stringify(view);
    expect(json).not.toContain('"magic11Seen":{');
  });

  it('does not leak played card identities through the public event log', () => {
    const state = createStateWithRoles([
      'WHITE_ROSE',
      'BISHOP',
      'BELIEVER',
      'DOUBLE_KNIFE',
      'DARK_KNIFE',
    ]);
    const withEvent = {
      ...state,
      eventLog: [
        {
          id: 'e1',
          type: 'CARD_PLAYED' as const,
          payload: { playerId: 'p1', card: 'BISHOP' },
          timestamp: 1,
        },
      ],
    };
    const view = buildPlayerView(withEvent, 'p0');
    const json = JSON.stringify(view);
    expect(json).not.toContain('BISHOP');
  });
});

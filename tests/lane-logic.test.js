// tests/lane-logic.test.js — table-driven unit tests for the PURE logic in
// games/bumper-lane-runner/lane-logic.js. No DOM, no gamepad, no side effects.
import { describe, it, expect } from './harness.js';
import {
  nextLane,
  resolveObstacleHit,
  tryCollectCoin,
} from '../games/bumper-lane-runner/lane-logic.js';

describe('nextLane', () => {
  const table = [
    { name: 'left from middle', input: { current: 1, direction: 'left' }, expected: 0 },
    { name: 'right from middle', input: { current: 1, direction: 'right' }, expected: 2 },
    { name: 'left at edge stays', input: { current: 0, direction: 'left' }, expected: 0 },
    { name: 'right at edge stays', input: { current: 2, direction: 'right' }, expected: 2 },
    { name: 'left from top', input: { current: 2, direction: 'left' }, expected: 1 },
    { name: 'right from bottom', input: { current: 0, direction: 'right' }, expected: 1 },
    {
      name: 'unknown direction keeps the lane',
      input: { current: 1, direction: 'sideways' },
      expected: 1,
    },
  ];

  table.forEach(({ name, input, expected }) => {
    it(name, () => {
      expect(nextLane(input.current, input.direction, 3)).toBe(expected);
    });
  });

  it('respects a custom laneCount', () => {
    expect(nextLane(4, 'right', 5)).toBe(4); // at the top edge of 5 lanes
    expect(nextLane(3, 'right', 5)).toBe(4);
    expect(nextLane(0, 'left', 5)).toBe(0);
  });

  it('clamps an out-of-range current', () => {
    expect(nextLane(99, 'left', 3)).toBe(2);
    expect(nextLane(-5, 'right', 3)).toBe(0);
  });

  it('defaults laneCount to 3', () => {
    expect(nextLane(1, 'left')).toBe(0);
    expect(nextLane(1, 'right')).toBe(2);
  });

  it('handles a single lane (no movement)', () => {
    expect(nextLane(0, 'left', 1)).toBe(0);
    expect(nextLane(0, 'right', 1)).toBe(0);
  });
});

describe('resolveObstacleHit', () => {
  it('bounces right when hit in the leftmost lane (more room on the right)', () => {
    expect(resolveObstacleHit(0, { lane: 0 }, 3)).toBe(1);
  });

  it('bounces left when hit in the rightmost lane (more room on the left)', () => {
    expect(resolveObstacleHit(2, { lane: 2 }, 3)).toBe(1);
  });

  it('tie-breaks to the right when hit in the middle lane (equal room)', () => {
    expect(resolveObstacleHit(1, { lane: 1 }, 3)).toBe(2);
  });

  it('clamps when the bounce side has no room (trapped at edge with 1 lane)', () => {
    expect(resolveObstacleHit(0, { lane: 0 }, 1)).toBe(0);
  });

  it('does not bounce when the player is not in the obstacle lane', () => {
    expect(resolveObstacleHit(0, { lane: 2 }, 3)).toBe(0);
    expect(resolveObstacleHit(1, { lane: 0 }, 3)).toBe(1);
  });

  it('returns a value within [0, laneCount-1] across all lanes', () => {
    for (let lane = 0; lane < 3; lane += 1) {
      const result = resolveObstacleHit(lane, { lane }, 3);
      expect(result >= 0 && result <= 2).toBe(true);
    }
  });

  it('never returns the same lane as the obstacle when there is a neighbour', () => {
    // For every lane in a 3-lane track, a hit must move the player off it.
    for (let lane = 0; lane < 3; lane += 1) {
      const result = resolveObstacleHit(lane, { lane }, 3);
      expect(result !== lane).toBe(true);
    }
  });

  it('bounces toward the side with more room on wider tracks', () => {
    // 5 lanes, hit in lane 1: roomLeft=1, roomRight=3 → bounce right to lane 2.
    expect(resolveObstacleHit(1, { lane: 1 }, 5)).toBe(2);
    // 5 lanes, hit in lane 3: roomLeft=3, roomRight=1 → bounce left to lane 2.
    expect(resolveObstacleHit(3, { lane: 3 }, 5)).toBe(2);
  });

  it('treats a missing obstacle as no bounce', () => {
    expect(resolveObstacleHit(1, null, 3)).toBe(1);
    expect(resolveObstacleHit(1, {}, 3)).toBe(1);
  });

  it('clamps an out-of-range current lane', () => {
    expect(resolveObstacleHit(99, { lane: 99 }, 3)).toBe(2);
    expect(resolveObstacleHit(-1, { lane: -1 }, 3)).toBe(0);
  });
});

describe('tryCollectCoin', () => {
  it('returns true when player overlaps coin', () => {
    expect(tryCollectCoin({ x: 0, y: 0, r: 5 }, { x: 4, y: 0, r: 5 })).toBe(true);
  });

  it('returns true when player and coin just touch at the edge', () => {
    // distance 8 === r1 3 + r2 5
    expect(tryCollectCoin({ x: 0, y: 0, r: 3 }, { x: 8, y: 0, r: 5 })).toBe(true);
  });

  it('returns false when player and coin do not overlap', () => {
    expect(tryCollectCoin({ x: 0, y: 0, r: 3 }, { x: 20, y: 0, r: 5 })).toBe(false);
  });

  it('returns true for coincident centers', () => {
    expect(tryCollectCoin({ x: 1, y: 1, r: 2 }, { x: 1, y: 1, r: 2 })).toBe(true);
  });

  it('normalizes a coin `size` (diameter) into a radius', () => {
    // coin size 10 → radius 5; player radius 3 at distance 8 → edge touch.
    expect(tryCollectCoin({ x: 0, y: 0, r: 3 }, { x: 8, y: 0, size: 10 })).toBe(true);
  });

  it('returns false for missing inputs', () => {
    expect(tryCollectCoin(null, { x: 0, y: 0, r: 5 })).toBe(false);
    expect(tryCollectCoin({ x: 0, y: 0, r: 5 }, null)).toBe(false);
  });

  it('does not mutate its inputs', () => {
    const player = { x: 0, y: 0, r: 5 };
    const coin = { x: 1, y: 1, r: 3 };
    tryCollectCoin(player, coin);
    expect(player).toEqual({ x: 0, y: 0, r: 5 });
    expect(coin).toEqual({ x: 1, y: 1, r: 3 });
  });
});

// tests/track-logic.test.js — table-driven unit tests for the PURE logic in
// games/city-pop-dj/track-logic.js. No DOM, no gamepad, no Web Audio.
import { describe, it, expect } from './harness.js';
import { FACE_POSITIONS } from '../shared/button-mapping.js';
import {
  trackForPosition,
  activeTracks,
  mixGain,
  TRACK_IDS,
} from '../games/city-pop-dj/track-logic.js';

describe('trackForPosition', () => {
  const table = [
    { name: 'bottom → bass', input: 'bottom', expected: 'bass' },
    { name: 'right → drums', input: 'right', expected: 'drums' },
    { name: 'left → melody', input: 'left', expected: 'melody' },
    { name: 'top → vocals', input: 'top', expected: 'vocals' },
    { name: 'unknown "middle" → null', input: 'middle', expected: null },
    { name: 'empty string → null', input: '', expected: null },
  ];

  table.forEach(({ name, input, expected }) => {
    it(name, () => {
      expect(trackForPosition(input)).toBe(expected);
    });
  });

  it('returns null for undefined', () => {
    expect(trackForPosition(undefined)).toBe(null);
  });

  it('returns null for null', () => {
    expect(trackForPosition(null)).toBe(null);
  });

  it('returns a value for every canonical face position', () => {
    FACE_POSITIONS.forEach((pos) => {
      expect(trackForPosition(pos) != null).toBe(true);
    });
  });

  it('maps each face position to a distinct track', () => {
    const tracks = FACE_POSITIONS.map(trackForPosition);
    expect(new Set(tracks).size).toBe(FACE_POSITIONS.length);
  });

  it('only ever returns canonical track ids (or null)', () => {
    const all = ['bottom', 'right', 'left', 'top', 'nonsense', null];
    all.forEach((pos) => {
      const t = trackForPosition(pos);
      expect(t === null || TRACK_IDS.includes(t)).toBe(true);
    });
  });
});

describe('activeTracks', () => {
  it('returns an empty Set for no held positions', () => {
    const out = activeTracks([]);
    expect(out instanceof Set).toBe(true);
    expect(out.size).toBe(0);
  });

  it('returns an empty Set for null input', () => {
    expect(activeTracks(null).size).toBe(0);
  });

  it('returns an empty Set for undefined input', () => {
    expect(activeTracks(undefined).size).toBe(0);
  });

  it('maps a single held position to its track', () => {
    const out = activeTracks(['bottom']);
    expect(Array.from(out)).toEqual(['bass']);
  });

  const multiTable = [
    { name: 'bottom+right', input: ['bottom', 'right'], expected: ['bass', 'drums'] },
    { name: 'left+top', input: ['left', 'top'], expected: ['melody', 'vocals'] },
    {
      name: 'bottom+left+top',
      input: ['bottom', 'left', 'top'],
      expected: ['bass', 'melody', 'vocals'],
    },
    {
      name: 'all four',
      input: ['bottom', 'right', 'left', 'top'],
      expected: ['bass', 'drums', 'melody', 'vocals'],
    },
  ];

  multiTable.forEach(({ name, input, expected }) => {
    it(`maps ${name} to the right track set`, () => {
      const out = activeTracks(input);
      expect(out instanceof Set).toBe(true);
      // Order within a Set follows insertion order; compare as sorted arrays
      // so the assertion is order-independent.
      const got = Array.from(out).sort();
      const want = [...expected].sort();
      expect(got).toEqual(want);
    });
  });

  it('de-duplicates repeated positions', () => {
    const out = activeTracks(['bottom', 'bottom', 'bottom']);
    expect(out.size).toBe(1);
    expect(Array.from(out)).toEqual(['bass']);
  });

  it('ignores unknown positions but keeps valid ones', () => {
    const out = activeTracks(['middle', 'top', '', 'right']);
    const got = Array.from(out).sort();
    expect(got).toEqual(['drums', 'vocals']);
  });

  it('accepts a Set of positions as input', () => {
    const input = new Set(['left', 'top']);
    const out = activeTracks(input);
    const got = Array.from(out).sort();
    expect(got).toEqual(['melody', 'vocals']);
  });

  it('does not mutate an array input', () => {
    const input = ['bottom', 'right'];
    const snapshot = [...input];
    activeTracks(input);
    expect(input).toEqual(snapshot);
  });

  it('returns a fresh Set each call (no shared state)', () => {
    const a = activeTracks(['bottom']);
    const b = activeTracks(['bottom']);
    expect(a !== b).toBe(true);
    a.add('drums');
    expect(b.has('drums')).toBe(false);
  });
});

describe('mixGain', () => {
  const activeAll = activeTracks(['bottom', 'right', 'left', 'top']);

  TRACK_IDS.forEach((track) => {
    it(`returns 1 for an active track (${track})`, () => {
      expect(mixGain(track, activeAll)).toBe(1);
    });
  });

  it('returns 0 for an inactive track', () => {
    const onlyBass = activeTracks(['bottom']);
    expect(mixGain('drums', onlyBass)).toBe(0);
    expect(mixGain('melody', onlyBass)).toBe(0);
    expect(mixGain('vocals', onlyBass)).toBe(0);
  });

  it('returns 0 for every track when nothing is held', () => {
    const empty = activeTracks([]);
    TRACK_IDS.forEach((track) => {
      expect(mixGain(track, empty)).toBe(0);
    });
  });

  it('flips from 0 to 1 when its position joins the held set', () => {
    let active = activeTracks(['bottom']);
    expect(mixGain('drums', active)).toBe(0);
    active = activeTracks(['bottom', 'right']);
    expect(mixGain('drums', active)).toBe(1);
  });

  it('accepts a raw iterable instead of a Set', () => {
    expect(mixGain('bass', ['bottom'])).toBe(1);
    expect(mixGain('bass', ['right'])).toBe(0);
    expect(mixGain('bass', new Set(['bottom', 'top']))).toBe(1);
  });

  it('returns 0 for a null track', () => {
    expect(mixGain(null, activeAll)).toBe(0);
  });

  it('returns 0 for an unknown track id', () => {
    expect(mixGain('cowbell', activeAll)).toBe(0);
  });

  it('returns 0 when the active set is null', () => {
    expect(mixGain('bass', null)).toBe(0);
  });
});

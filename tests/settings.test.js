// tests/settings.test.js — table-driven unit tests for the PURE logic in
// shared/settings.js (specifically `mergeDefaults` and `DEFAULT_SETTINGS`).
// No DOM, no localStorage, no gamepad, no side effects.
import { describe, it, expect } from './harness.js';
import { mergeDefaults, DEFAULT_SETTINGS } from '../shared/settings.js';

describe('DEFAULT_SETTINGS', () => {
  it('has exactly the expected keys', () => {
    expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual(
      ['controllerOverlay', 'crt', 'uiSounds', 'reduceMotion', 'layoutOverride'].sort(),
    );
  });

  it('matches the canonical shape', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      controllerOverlay: false,
      crt: true,
      uiSounds: true,
      reduceMotion: false,
      layoutOverride: 'auto',
    });
  });
});

describe('mergeDefaults — non-object / missing input returns fresh defaults', () => {
  const table = [
    { name: 'null → defaults', stored: null },
    { name: 'undefined → defaults', stored: undefined },
    { name: 'array → defaults', stored: [1, 2, 3] },
    { name: 'string → defaults', stored: '{"crt":false}' },
    { name: 'number → defaults', stored: 42 },
    { name: 'boolean → defaults', stored: true },
  ];

  table.forEach(({ name, stored }) => {
    it(name, () => {
      expect(mergeDefaults(stored, DEFAULT_SETTINGS)).toEqual({
        controllerOverlay: false,
        crt: true,
        uiSounds: true,
        reduceMotion: false,
        layoutOverride: 'auto',
      });
    });
  });
});

describe('mergeDefaults — fills missing keys and keeps valid values', () => {
  it('empty object → all defaults', () => {
    expect(mergeDefaults({}, DEFAULT_SETTINGS)).toEqual({
      controllerOverlay: false,
      crt: true,
      uiSounds: true,
      reduceMotion: false,
      layoutOverride: 'auto',
    });
  });

  const fillTable = [
    { name: 'fills a missing boolean key with default', stored: {}, key: 'crt', expected: true },
    { name: 'keeps a correctly-typed boolean (true)', stored: { crt: true }, key: 'crt', expected: true },
    { name: 'keeps a correctly-typed boolean (false)', stored: { crt: false }, key: 'crt', expected: false },
    { name: 'keeps controllerOverlay=false', stored: { controllerOverlay: false }, key: 'controllerOverlay', expected: false },
    { name: 'keeps controllerOverlay=true', stored: { controllerOverlay: true }, key: 'controllerOverlay', expected: true },
    { name: 'keeps uiSounds=false', stored: { uiSounds: false }, key: 'uiSounds', expected: false },
    { name: 'keeps reduceMotion=true', stored: { reduceMotion: true }, key: 'reduceMotion', expected: true },
  ];
  fillTable.forEach(({ name, stored, key, expected }) => {
    it(name, () => {
      expect(mergeDefaults(stored, DEFAULT_SETTINGS)[key]).toBe(expected);
    });
  });

  it('fills only the missing key, keeps the rest from stored', () => {
    const stored = { uiSounds: false, reduceMotion: true };
    const merged = mergeDefaults(stored, DEFAULT_SETTINGS);
    expect(merged.uiSounds).toBe(false);
    expect(merged.reduceMotion).toBe(true);
    expect(merged.controllerOverlay).toBe(false); // filled
    expect(merged.crt).toBe(true); // filled
    expect(merged.layoutOverride).toBe('auto'); // filled
  });
});

describe('mergeDefaults — drops unknown keys', () => {
  it('removes keys not present in defaults', () => {
    const stored = {
      crt: false,
      evilKey: 'malicious',
      __proto__: 'nope',
      controllerOverlay: true,
    };
    const merged = mergeDefaults(stored, DEFAULT_SETTINGS);
    expect(Object.keys(merged).sort()).toEqual(
      ['controllerOverlay', 'crt', 'uiSounds', 'reduceMotion', 'layoutOverride'].sort(),
    );
    expect('evilKey' in merged).toBe(false);
  });

  it('drops unknown keys even when value type matches a default-type', () => {
    const stored = { crt: true, unknownBoolean: false };
    const merged = mergeDefaults(stored, DEFAULT_SETTINGS);
    expect('unknownBoolean' in merged).toBe(false);
  });
});

describe('mergeDefaults — layoutOverride enum handling', () => {
  const validTable = [
    { name: "accepts 'auto'", value: 'auto' },
    { name: "accepts 'xbox'", value: 'xbox' },
    { name: "accepts 'playstation'", value: 'playstation' },
    { name: "accepts 'switch'", value: 'switch' },
  ];
  validTable.forEach(({ name, value }) => {
    it(name, () => {
      expect(mergeDefaults({ layoutOverride: value }, DEFAULT_SETTINGS).layoutOverride).toBe(value);
    });
  });

  const rejectTable = [
    { name: "rejects 'pc' (out of enum) → default", value: 'pc' },
    { name: "rejects 'XBOX' (wrong case) → default", value: 'XBOX' },
    { name: "rejects '' (empty) → default", value: '' },
    { name: "rejects 'auto ' (trailing space) → default", value: 'auto ' },
  ];
  rejectTable.forEach(({ name, value }) => {
    it(name, () => {
      expect(mergeDefaults({ layoutOverride: value }, DEFAULT_SETTINGS).layoutOverride).toBe('auto');
    });
  });

  const wrongTypeTable = [
    { name: 'rejects boolean true → default', value: true },
    { name: 'rejects number 1 → default', value: 1 },
    { name: 'rejects null → default', value: null },
    { name: 'rejects object → default', value: { x: 'auto' } },
    { name: 'rejects array → default', value: ['auto'] },
  ];
  wrongTypeTable.forEach(({ name, value }) => {
    it(name, () => {
      expect(mergeDefaults({ layoutOverride: value }, DEFAULT_SETTINGS).layoutOverride).toBe('auto');
    });
  });
});

describe('mergeDefaults — boolean keys reject non-booleans', () => {
  const boolKeys = ['controllerOverlay', 'crt', 'uiSounds', 'reduceMotion'];
  const wrongValues = ['true', 1, 0, null, undefined, {}];

  boolKeys.forEach((key) => {
    wrongValues.forEach((value) => {
      it(`${key} rejects ${JSON.stringify(value)} → default`, () => {
        const merged = mergeDefaults({ [key]: value }, DEFAULT_SETTINGS);
        expect(merged[key]).toBe(DEFAULT_SETTINGS[key]);
      });
    });
  });
});

describe('mergeDefaults — purity / no mutation', () => {
  it('does not mutate the input stored object', () => {
    const stored = { crt: false, extra: 1 };
    const snapshot = { ...stored };
    mergeDefaults(stored, DEFAULT_SETTINGS);
    expect(stored).toEqual(snapshot);
  });

  it('does not mutate DEFAULT_SETTINGS', () => {
    const snapshot = { ...DEFAULT_SETTINGS };
    mergeDefaults({ crt: false, layoutOverride: 'xbox', bogus: 1 }, DEFAULT_SETTINGS);
    expect({ ...DEFAULT_SETTINGS }).toEqual(snapshot);
    expect(DEFAULT_SETTINGS.layoutOverride).toBe('auto');
    expect(DEFAULT_SETTINGS.crt).toBe(true);
  });

  it('returns a brand-new object (not the input, not DEFAULT_SETTINGS)', () => {
    const stored = { crt: false };
    const merged = mergeDefaults(stored, DEFAULT_SETTINGS);
    expect(merged === stored).toBe(false);
    expect(merged === DEFAULT_SETTINGS).toBe(false);
  });

  it('returns a fresh object on every call (no shared references)', () => {
    const a = mergeDefaults({ crt: false }, DEFAULT_SETTINGS);
    const b = mergeDefaults({ crt: false }, DEFAULT_SETTINGS);
    expect(a).toEqual(b);
    expect(a === b).toBe(false);
  });

  it('mutating the result does not affect future results', () => {
    const a = mergeDefaults({ crt: false }, DEFAULT_SETTINGS);
    a.crt = true;
    a.bogus = 'x';
    const b = mergeDefaults({ crt: false }, DEFAULT_SETTINGS);
    expect(b.crt).toBe(false);
    expect('bogus' in b).toBe(false);
  });
});

// tests/button-mapping.test.js — table-driven unit tests for the PURE mapping module.
import { describe, it, expect } from './harness.js';
import {
  FACE_POSITIONS,
  FACE_BOTTOM,
  FACE_RIGHT,
  FACE_LEFT,
  FACE_TOP,
  DPAD_UP,
  DPAD_DOWN,
  DPAD_LEFT,
  DPAD_RIGHT,
  BUMPER_LEFT,
  BUMPER_RIGHT,
  TRIGGER_LEFT,
  TRIGGER_RIGHT,
  STICK_LEFT,
  STICK_RIGHT,
  STICK_CLICK_LEFT,
  STICK_CLICK_RIGHT,
  detectLayout,
  faceLabel,
  shoulderLabel,
  triggerLabel,
  stickClickLabel,
  buttonIndexToEvent,
  axisToStickEvent,
  KEY_TO_EVENT,
} from '../shared/button-mapping.js';

describe('FACE_POSITIONS', () => {
  it('lists the four face positions clockwise from bottom', () => {
    expect(FACE_POSITIONS).toEqual(['bottom', 'right', 'left', 'top']);
  });
});

describe('detectLayout', () => {
  const cases = [
    // Chromium Xbox — Vendor 045e in body.
    {
      name: 'Chrome Xbox Wireless (045e)',
      id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)',
      expected: 'xbox',
    },
    // Chromium DualSense — Sony VID 054c (reports as generic "Wireless Controller").
    {
      name: 'Chrome DualSense (054c)',
      id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
      expected: 'playstation',
    },
    // Chromium Switch Pro — Nintendo VID 057e.
    {
      name: 'Chrome Pro Controller (057e)',
      id: 'Pro Controller (Vendor: 057e Product: 2009)',
      expected: 'switch',
    },
    // Generic Chrome "Wireless Controller" with no VID → name fallback misses → default xbox.
    {
      name: 'Chrome generic Wireless Controller (no VID)',
      id: 'Wireless Controller (STANDARD GAMEPAD)',
      expected: 'xbox',
    },
    // Firefox bare xinput.
    {
      name: 'Firefox bare xinput',
      id: 'xinput',
      expected: 'xbox',
    },
    // Firefox Sony DualShock — leading VID 054c-…-name.
    {
      name: 'Firefox Sony DualShock (054c)',
      id: '054c-0ce6-Sony DualShock 4',
      expected: 'playstation',
    },
    // Firefox Xbox 360 pad — leading VID 045e-…-name.
    {
      name: 'Firefox Xbox 360 pad (045e)',
      id: '045e-028e-Microsoft X-Box 360 pad',
      expected: 'xbox',
    },
    // Firefox Switch Pro — leading VID 057e-…-name.
    {
      name: 'Firefox Pro Controller (057e)',
      id: '057e-2009-Pro Controller',
      expected: 'switch',
    },
    // Name-substring fallback (no VID): playstation.
    {
      name: 'Name "DualSense" fallback',
      id: 'DualSense Edge',
      expected: 'playstation',
    },
    // Name-substring fallback (no VID): switch.
    {
      name: 'Name "Nintendo" fallback',
      id: 'Nintendo Joy-Con',
      expected: 'switch',
    },
    // Unknown / empty → default xbox.
    { name: 'empty id defaults to xbox', id: '', expected: 'xbox' },
    { name: 'null id defaults to xbox', id: null, expected: 'xbox' },
  ];

  cases.forEach(({ name, id, expected }) => {
    it(`${name} → ${expected}`, () => {
      expect(detectLayout(id)).toBe(expected);
    });
  });
});

describe('faceLabel', () => {
  const table = [
    // Xbox
    { layout: 'xbox', position: 'bottom', expected: 'A' },
    { layout: 'xbox', position: 'right', expected: 'B' },
    { layout: 'xbox', position: 'left', expected: 'X' },
    { layout: 'xbox', position: 'top', expected: 'Y' },
    // PlayStation
    { layout: 'playstation', position: 'bottom', expected: 'Cross' },
    { layout: 'playstation', position: 'right', expected: 'Circle' },
    { layout: 'playstation', position: 'left', expected: 'Square' },
    { layout: 'playstation', position: 'top', expected: 'Triangle' },
    // Switch
    { layout: 'switch', position: 'bottom', expected: 'B' },
    { layout: 'switch', position: 'right', expected: 'A' },
    { layout: 'switch', position: 'left', expected: 'Y' },
    { layout: 'switch', position: 'top', expected: 'X' },
  ];

  table.forEach(({ layout, position, expected }) => {
    it(`${layout}/${position} → ${expected}`, () => {
      expect(faceLabel(layout, position)).toBe(expected);
    });
  });
});

describe('shoulderLabel', () => {
  const table = [
    { layout: 'xbox', side: 'left', expected: 'LB' },
    { layout: 'xbox', side: 'right', expected: 'RB' },
    { layout: 'playstation', side: 'left', expected: 'L1' },
    { layout: 'playstation', side: 'right', expected: 'R1' },
    { layout: 'switch', side: 'left', expected: 'L' },
    { layout: 'switch', side: 'right', expected: 'R' },
  ];

  table.forEach(({ layout, side, expected }) => {
    it(`${layout}/${side} → ${expected}`, () => {
      expect(shoulderLabel(layout, side)).toBe(expected);
    });
  });
});

describe('triggerLabel', () => {
  const table = [
    { layout: 'xbox', side: 'left', expected: 'LT' },
    { layout: 'xbox', side: 'right', expected: 'RT' },
    { layout: 'playstation', side: 'left', expected: 'L2' },
    { layout: 'playstation', side: 'right', expected: 'R2' },
    { layout: 'switch', side: 'left', expected: 'ZL' },
    { layout: 'switch', side: 'right', expected: 'ZR' },
  ];

  table.forEach(({ layout, side, expected }) => {
    it(`${layout}/${side} → ${expected}`, () => {
      expect(triggerLabel(layout, side)).toBe(expected);
    });
  });
});

describe('stickClickLabel', () => {
  const table = [
    { layout: 'xbox', side: 'left', expected: 'L3' },
    { layout: 'xbox', side: 'right', expected: 'R3' },
    { layout: 'playstation', side: 'left', expected: 'L3' },
    { layout: 'playstation', side: 'right', expected: 'R3' },
    { layout: 'switch', side: 'left', expected: 'L-stick' },
    { layout: 'switch', side: 'right', expected: 'R-stick' },
  ];

  table.forEach(({ layout, side, expected }) => {
    it(`${layout}/${side} → ${expected}`, () => {
      expect(stickClickLabel(layout, side)).toBe(expected);
    });
  });
});

describe('buttonIndexToEvent', () => {
  const table = [
    { i: 0, expected: FACE_BOTTOM },
    { i: 1, expected: FACE_RIGHT },
    { i: 2, expected: FACE_LEFT },
    { i: 3, expected: FACE_TOP },
    { i: 4, expected: BUMPER_LEFT },
    { i: 5, expected: BUMPER_RIGHT },
    { i: 6, expected: TRIGGER_LEFT },
    { i: 7, expected: TRIGGER_RIGHT },
    { i: 8, expected: null },
    { i: 9, expected: null },
    { i: 10, expected: STICK_CLICK_LEFT },
    { i: 11, expected: STICK_CLICK_RIGHT },
    { i: 12, expected: DPAD_UP },
    { i: 13, expected: DPAD_DOWN },
    { i: 14, expected: DPAD_LEFT },
    { i: 15, expected: DPAD_RIGHT },
    { i: 16, expected: null },
  ];

  table.forEach(({ i, expected }) => {
    it(`index ${i} → ${expected}`, () => {
      expect(buttonIndexToEvent(i)).toBe(expected);
    });
  });

  it('returns null for out-of-range indices', () => {
    expect(buttonIndexToEvent(17)).toBe(null);
    expect(buttonIndexToEvent(-1)).toBe(null);
  });
});

describe('axisToStickEvent', () => {
  it('axes 0 and 1 → left stick', () => {
    expect(axisToStickEvent(0)).toBe(STICK_LEFT);
    expect(axisToStickEvent(1)).toBe(STICK_LEFT);
  });

  it('axes 2 and 3 → right stick', () => {
    expect(axisToStickEvent(2)).toBe(STICK_RIGHT);
    expect(axisToStickEvent(3)).toBe(STICK_RIGHT);
  });

  it('out-of-range axes → null', () => {
    expect(axisToStickEvent(4)).toBe(null);
    expect(axisToStickEvent(-1)).toBe(null);
  });
});

describe('KEY_TO_EVENT', () => {
  const table = [
    { code: 'KeyW', name: FACE_TOP },
    { code: 'KeyA', name: FACE_LEFT },
    { code: 'KeyS', name: FACE_BOTTOM },
    { code: 'KeyD', name: FACE_RIGHT },
    { code: 'ArrowUp', name: DPAD_UP },
    { code: 'ArrowDown', name: DPAD_DOWN },
    { code: 'ArrowLeft', name: DPAD_LEFT },
    { code: 'ArrowRight', name: DPAD_RIGHT },
    { code: 'KeyQ', name: BUMPER_LEFT },
    { code: 'KeyE', name: BUMPER_RIGHT },
    { code: 'KeyC', name: STICK_CLICK_LEFT },
    { code: 'KeyV', name: STICK_CLICK_RIGHT },
  ];

  table.forEach(({ code, name }) => {
    it(`${code} dispatches ${name}`, () => {
      const entries = KEY_TO_EVENT[code];
      const names = entries.map((e) => e.name);
      expect(names).toContain(name);
    });
  });

  it('ShiftLeft dispatches trigger-left with value 1', () => {
    const entry = KEY_TO_EVENT.ShiftLeft[0];
    expect(entry.name).toBe(TRIGGER_LEFT);
    expect(entry.detail).toEqual({ value: 1 });
  });

  it('Space dispatches trigger-right with value 1', () => {
    const entry = KEY_TO_EVENT.Space[0];
    expect(entry.name).toBe(TRIGGER_RIGHT);
    expect(entry.detail).toEqual({ value: 1 });
  });

  it('every mapped key produces an array of {name} entries', () => {
    Object.values(KEY_TO_EVENT).forEach((entries) => {
      entries.forEach((entry) => {
        expect(typeof entry.name).toBe('string');
        expect(entry.name.startsWith('gamepad-')).toBe(true);
      });
    });
  });
});

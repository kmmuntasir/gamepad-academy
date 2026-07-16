// shared/settings.js — persistence layer for user settings.
// `mergeDefaults` is PURE and side-effect-free (the unit-test surface).
// `load` / `set` touch `localStorage` but NEVER throw (private mode / Safari
// can throw on access — fail soft so settings still work for the session).

const STORAGE_KEY = 'gac:settings';

/**
 * Allowed values for the `layoutOverride` setting.
 * 'auto' means: defer to the detected physical controller layout.
 */
export const LAYOUT_OVERRIDE_VALUES = ['auto', 'xbox', 'playstation', 'switch'];

/**
 * Frozen defaults. New copies are returned from `mergeDefaults` so callers
 * can never mutate this object by reference.
 */
export const DEFAULT_SETTINGS = Object.freeze({
  controllerOverlay: false,
  crt: true,
  uiSounds: true,
  reduceMotion: false,
  layoutOverride: 'auto',
});

/**
 * Merge a stored value against defaults, returning a NEW object.
 *
 * For each key in `defaults`:
 *   - include `stored[key]` when its `typeof` matches the default's type, AND
 *   - for `layoutOverride`, the value must be in `LAYOUT_OVERRIDE_VALUES`;
 * otherwise fall back to the default.
 *
 * Keys present in `stored` but not in `defaults` are dropped.
 *
 * Pure: no `localStorage`, no side effects, no mutation of inputs.
 *
 * @param {*} stored        Parsed JSON from storage (may be null/undefined/non-object).
 * @param {Object} defaults Source of truth for shape + types.
 * @returns {Object} A fresh, validated settings object.
 */
export function mergeDefaults(stored, defaults) {
  const result = {};
  const isPlainObject =
    stored !== null &&
    typeof stored === 'object' &&
    !Array.isArray(stored);

  for (const key of Object.keys(defaults)) {
    const defaultValue = defaults[key];
    const defaultType = typeof defaultValue;
    const candidate = isPlainObject ? stored[key] : undefined;

    if (typeof candidate === defaultType) {
      if (key === 'layoutOverride' && !LAYOUT_OVERRIDE_VALUES.includes(candidate)) {
        result[key] = defaultValue;
      } else {
        result[key] = candidate;
      }
    } else {
      result[key] = defaultValue;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// In-memory cache + pub/sub (NOT unit-tested; DOM/localStorage surface)
// ---------------------------------------------------------------------------

// Cached current settings; refreshed by `load` and every successful `set`.
let currentSettings = mergeDefaults(null, DEFAULT_SETTINGS);

// In-page subscribers. The `storage` event fires cross-tab only, so we need
// our own pub/sub for same-tab changes.
const subscribers = new Set();

/**
 * Load settings from `localStorage`, merging against defaults.
 * Never throws — on any read/parse error, returns a fresh copy of defaults.
 *
 * @returns {Object} The current settings object (also retrievable via `getAll`).
 */
export function load() {
  let parsed;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    parsed = raw === null ? null : JSON.parse(raw);
  } catch (error) {
    // Corrupt JSON or blocked storage: fall back to defaults.
    parsed = null;
  }
  currentSettings = mergeDefaults(parsed, DEFAULT_SETTINGS);
  return currentSettings;
}

/**
 * Return the current in-memory settings object.
 * Callers MUST NOT mutate the returned object; use `set` instead.
 *
 * @returns {Object} A snapshot of the current settings.
 */
export function getAll() {
  return currentSettings;
}

/**
 * Update one setting and persist it. Unknown keys are a silent no-op.
 * On a thrown `setItem` (private mode / Safari), the in-memory value is kept
 * so settings still work for the rest of the session; subscribers are still
 * notified because the in-memory state did change.
 *
 * @param {string} key   Setting name (must exist in `DEFAULT_SETTINGS`).
 * @param {*} value      New value (type should match the default's type).
 * @returns {Object} The current settings object.
 */
export function set(key, value) {
  if (!(key in DEFAULT_SETTINGS)) {
    return currentSettings;
  }

  const next = { ...currentSettings, [key]: value };
  currentSettings = next;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
  } catch (error) {
    // Fail soft: persistence may be blocked, but keep the in-memory update.
  }

  notify();
  return currentSettings;
}

/**
 * Register a listener fired on every successful `set`. The `storage` event
 * only fires cross-tab, so an in-page pub/sub is required for same-tab updates.
 *
 * @param {(settings: Object) => void} cb Receives the full settings object.
 * @returns {() => void} Unsubscribe function.
 */
export function subscribe(cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function notify() {
  for (const cb of subscribers) {
    try {
      cb(currentSettings);
    } catch (error) {
      // A listener throwing must not break the notify loop or the game.
    }
  }
}

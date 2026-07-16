// games/city-pop-dj/track-logic.js — PURE mixing-desk logic.
// Zero dependencies. No DOM, no gamepad, no Web Audio, no side effects.
// Unit-tested in tests/track-logic.test.js.

// Face position → musical track id. Mirrors the City-Pop DJ spec:
//   Bottom → bassline, Right → drums, Left → melody, Top → vocals.
const POSITION_TO_TRACK = {
  bottom: 'bass',
  right: 'drums',
  left: 'melody',
  top: 'vocals',
};

// The four canonical track ids in a stable order (used by callers for
// deterministic iteration / rendering). Exported for convenience.
export const TRACK_IDS = ['bass', 'drums', 'melody', 'vocals'];

/**
 * Map a held face position to its musical track id.
 *
 * @param {string} position - one of 'bottom' | 'right' | 'left' | 'top'
 * @returns {'bass'|'drums'|'melody'|'vocals'|null} track id, or null if unknown
 */
export function trackForPosition(position) {
  const track = POSITION_TO_TRACK[position];
  return track != null ? track : null;
}

/**
 * Compute the set of active track ids from the currently-held face positions.
 *
 * Accepts either a plain Array or a Set of positions; unknown positions are
 * ignored; duplicates are de-duplicated. Returns a Set (iterable, has(), for
 * O(1) membership) of track ids, so `mixGain` can query it directly.
 *
 * @param {Iterable<string>} heldPositions
 * @returns {Set<string>} active track ids (possibly empty)
 */
export function activeTracks(heldPositions) {
  const out = new Set();
  if (!heldPositions) return out;
  // Works for both Array and Set (both are iterable); also tolerates a
  // falsy/undefined input by returning the empty set above.
  for (const position of heldPositions) {
    const track = POSITION_TO_TRACK[position];
    if (track != null) out.add(track);
  }
  return out;
}

/**
 * Target linear gain for a track given the current active set.
 *
 * @param {string} track - track id
 * @param {Set<string>|Iterable<string>} active - the set returned by activeTracks()
 * @returns {number} 1 if the track is active, else 0
 */
export function mixGain(track, active) {
  if (track == null) return 0;
  if (!active) return 0;
  // Normalize: accept a Set directly, or rebuild one from any iterable.
  const set = active instanceof Set ? active : activeTracks(active);
  return set.has(track) ? 1 : 0;
}

// games/wildlife-photographer/camera-logic.js — PURE camera/reticle logic.
// Zero dependencies. No DOM, no Canvas, no gamepad. Fully unit-tested in
// tests/camera-logic.test.js.
//
// Coordinate convention:
//   - `offset`  is the camera's top-left corner in WORLD space (px). Increasing
//               offset.x pans the view rightward (more world becomes visible on
//               the right), increasing offset.y pans it downward.
//   - `animal`  lives in WORLD space: `{ x, y }` is the animal's center.
//   - `reticle` is the aim radius (px) around the viewport center that counts
//               as "on target". A number, not an object — keeps the helper total
//               and trivial to unit-test.
//   - `viewport` is `{ w, h }` in CSS px.
//
// Every function is allocation-light and side-effect free (callers must
// reassign the returned offset rather than expect mutation).

// Default panning speed (px of world scrolled per second at full stick tilt).
// Chosen so a child can sweep across a ~3x viewport panorama in ~2 seconds.
export const DEFAULT_PAN_SPEED = 540;

// Default reticle hit radius (px) around the viewport center.
export const DEFAULT_RETICLE_RADIUS = 46;

/**
 * Pan the camera by one frame's worth of stick deflection, clamped to bounds.
 *
 * `stick` is the raw right-stick axis `{ x, y }` in -1..1 (sign convention from
 * the GamepadManager: left = -x, up = -y). The offset moves by
 * `stick * panSpeed * dt`. The result is clamped to `bounds`
 * `{ minX, maxX, minY, maxY }` so the camera never leaves the panorama.
 *
 * Returns a NEW `{ x, y }` object — the input `offset` is never mutated.
 *
 * @param {{x:number,y:number}} stick   right-stick axis (-1..1)
 * @param {{x:number,y:number}} offset  current camera offset (world px)
 * @param {{minX:number,maxX:number,minY:number,maxY:number}} bounds
 * @param {{panSpeed?:number, dt?:number}} [opts]
 * @returns {{x:number,y:number}}
 */
export function panCamera(stick, offset, bounds, opts = {}) {
  const panSpeed = opts.panSpeed != null ? opts.panSpeed : DEFAULT_PAN_SPEED;
  const dt = opts.dt != null ? opts.dt : 1 / 60;

  const sx = stick && Number.isFinite(stick.x) ? stick.x : 0;
  const sy = stick && Number.isFinite(stick.y) ? stick.y : 0;
  const ox = offset && Number.isFinite(offset.x) ? offset.x : 0;
  const oy = offset && Number.isFinite(offset.y) ? offset.y : 0;

  let nx = ox + sx * panSpeed * dt;
  let ny = oy + sy * panSpeed * dt;

  if (bounds) {
    if (Number.isFinite(bounds.minX)) nx = Math.max(bounds.minX, nx);
    if (Number.isFinite(bounds.maxX)) nx = Math.min(bounds.maxX, nx);
    if (Number.isFinite(bounds.minY)) ny = Math.max(bounds.minY, ny);
    if (Number.isFinite(bounds.maxY)) ny = Math.min(bounds.maxY, ny);
  }

  return { x: nx, y: ny };
}

/**
 * Is the animal (in world coords) currently under the center reticle?
 *
 * Screen position of the animal = world position minus the camera offset.
 * The reticle sits at the viewport center. The animal is "in reticle" when its
 * screen position is within `reticle` px (Euclidean) of that center.
 *
 * `reticle` may be a number (radius) or an object `{ w, h }` (half-extents of an
 * axis-aligned box); a number keeps it a circle, an object makes it a box.
 *
 * @param {{x:number,y:number}} animal   animal center in WORLD coords
 * @param {{x:number,y:number}} offset   camera offset (world px)
 * @param {number|{w:number,h:number}} reticle  aim radius or box half-extents
 * @param {{w:number,h:number}} viewport CSS-px viewport size
 * @returns {boolean}
 */
export function isInReticle(animal, offset, reticle, viewport) {
  if (!animal || !offset || !viewport) return false;

  const ax = Number.isFinite(animal.x) ? animal.x : 0;
  const ay = Number.isFinite(animal.y) ? animal.y : 0;
  const ox = Number.isFinite(offset.x) ? offset.x : 0;
  const oy = Number.isFinite(offset.y) ? offset.y : 0;
  const vw = Number.isFinite(viewport.w) ? viewport.w : 0;
  const vh = Number.isFinite(viewport.h) ? viewport.h : 0;

  // Animal center in SCREEN space.
  const screenX = ax - ox;
  const screenY = ay - oy;

  // Reticle center = viewport center.
  const cx = vw / 2;
  const cy = vh / 2;

  if (reticle != null && typeof reticle === 'object') {
    // Box mode: half-extents reticle.{w,h}.
    const hw = Number.isFinite(reticle.w) ? reticle.w : 0;
    const hh = Number.isFinite(reticle.h) ? reticle.h : 0;
    return (
      Math.abs(screenX - cx) <= hw && Math.abs(screenY - cy) <= hh
    );
  }

  // Circle mode: reticle is the radius.
  const r = Number.isFinite(reticle) ? reticle : DEFAULT_RETICLE_RADIUS;
  const dx = screenX - cx;
  const dy = screenY - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Return a NEW scrapbook array with `animal` appended.
 *
 * Pure: never mutates the input array. Dedupe is OPT-IN via `opts.dedupeKey`:
 * when provided (a string property name or a function `(a) => string`), an
 * animal with the same key already in the scrapbook is NOT added again. Without
 * `dedupeKey`, every snapshot appends (the spec leaves dedupe to the caller).
 *
 * @param {Array<object>} scrapbook
 * @param {object} animal
 * @param {{dedupeKey?:string|((a:object)=>string)}} [opts]
 * @returns {Array<object>}
 */
export function addPhoto(scrapbook, animal, opts = {}) {
  const base = Array.isArray(scrapbook) ? scrapbook : [];
  if (!animal) return base.slice();

  const dedupeKey = opts.dedupeKey;
  if (dedupeKey != null) {
    const keyOf =
      typeof dedupeKey === 'function'
        ? dedupeKey
        : (a) => (a && a[dedupeKey]) != null ? a[dedupeKey] : null;
    const incoming = keyOf(animal);
    if (incoming != null) {
      const exists = base.some((a) => keyOf(a) === incoming);
      if (exists) return base.slice();
    }
  }

  return base.concat(animal);
}

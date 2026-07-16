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

// Inertial-pan tuning defaults. `accel` is how quickly velocity approaches the
// stick-driven target (per second); `friction` is the per-second retention
// factor applied when the target is ~0 (lower = stops faster). `epsilon`
// snaps a component to zero once it is crawling slow enough to be invisible.
export const DEFAULT_ACCEL = 8.0;
export const DEFAULT_FRICTION = 0.12; // retained per second → ~88% lost per second
export const VELOCITY_EPSILON = 0.5; // px/sec below which we consider motion stopped

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

/**
 * Decay a 2D velocity toward zero, frame-rate independent.
 *
 * Uses the multiplicative model `v * friction ** dt`: if `friction = 0.12`,
 * one second of decay leaves 12% of the speed. Each component is snapped to
 * zero once below `epsilon` so the camera truly stops rather than creeping
 * indefinitely. Never mutates the input.
 *
 * @param {{x:number,y:number}} v         current velocity (px/sec)
 * @param {number} friction               fraction of speed RETAINED per second (0..1)
 * @param {number} dt                     seconds elapsed this frame
 * @param {number} [epsilon]              snap-to-zero threshold per component
 * @returns {{x:number,y:number}}         new velocity
 */
export function decayVelocity(v, friction, dt, epsilon = VELOCITY_EPSILON) {
  const ix = v && Number.isFinite(v.x) ? v.x : 0;
  const iy = v && Number.isFinite(v.y) ? v.y : 0;
  const f = Number.isFinite(friction) ? friction : DEFAULT_FRICTION;
  const t = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const eps = Number.isFinite(epsilon) ? epsilon : VELOCITY_EPSILON;

  const factor = Math.pow(f, t);
  let nx = ix * factor;
  let ny = iy * factor;
  if (Math.abs(nx) < eps) nx = 0;
  if (Math.abs(ny) < eps) ny = 0;
  return { x: nx, y: ny };
}

/**
 * Pan the camera with inertia — velocity accelerates toward the stick-driven
 * target, integrates into the offset, and clamps to bounds.
 *
 * Target velocity = `stick * panSpeed`. When the target is ~0 (stick released),
 * the current velocity decays by `friction` so the camera GLIDES to a stop
 * instead of freezing. When the target is non-zero, the velocity approaches
 * the target exponentially (`1 - exp(-accel*dt)`) so the ramp is smooth and
 * frame-rate independent.
 *
 * After integration, `offset` is clamped to `bounds` and the clamped velocity
 * component is zeroed — this prevents residual drift / bounce against an edge.
 *
 * Never mutates any argument. Returns `{ offset, velocity }` with NEW objects.
 *
 * @param {{x:number,y:number}} stick     right-stick axis (-1..1)
 * @param {{x:number,y:number}} offset    current camera offset (world px)
 * @param {{x:number,y:number}} velocity  current camera velocity (px/sec)
 * @param {{minX:number,maxX:number,minY:number,maxY:number}} bounds
 * @param {{panSpeed?:number, accel?:number, friction?:number, dt?:number}} [opts]
 * @returns {{offset:{x:number,y:number}, velocity:{x:number,y:number}}}
 */
export function panCameraInertial(stick, offset, velocity, bounds, opts = {}) {
  const panSpeed = opts.panSpeed != null ? opts.panSpeed : DEFAULT_PAN_SPEED;
  const accel = opts.accel != null ? opts.accel : DEFAULT_ACCEL;
  const friction = opts.friction != null ? opts.friction : DEFAULT_FRICTION;
  const dt = opts.dt != null ? opts.dt : 1 / 60;

  const sx = stick && Number.isFinite(stick.x) ? stick.x : 0;
  const sy = stick && Number.isFinite(stick.y) ? stick.y : 0;
  const ox = offset && Number.isFinite(offset.x) ? offset.x : 0;
  const oy = offset && Number.isFinite(offset.y) ? offset.y : 0;
  const vx = velocity && Number.isFinite(velocity.x) ? velocity.x : 0;
  const vy = velocity && Number.isFinite(velocity.y) ? velocity.y : 0;

  // Target velocity from the stick.
  const tvx = sx * panSpeed;
  const tvy = sy * panSpeed;

  // Approach/decay per axis. Frame-rate independent via the exponential model:
  //   approach: v += (target - v) * (1 - exp(-accel*dt))
  //   decay:    v *= friction ** dt  (when target ≈ 0)
  // Both reduce to the same form when accel = -ln(friction), so we can switch
  // branches cleanly without a discontinuity.
  const tau = Number.isFinite(dt) && dt > 0 ? dt : 0;

  let nvx;
  let nvy;
  if (Math.abs(tvx) < VELOCITY_EPSILON && Math.abs(tvy) < VELOCITY_EPSILON) {
    // No stick input → decay both axes.
    const decayed = decayVelocity({ x: vx, y: vy }, friction, tau);
    nvx = decayed.x;
    nvy = decayed.y;
  } else {
    // Per-axis blend: drive toward target where the stick is engaged, decay
    // where it is not (e.g. stick.x=1, stick.y=0 keeps ramping x, decays y).
    const kApproach = 1 - Math.exp(-accel * tau);
    const factor = Math.pow(friction, tau);

    nvx =
      Math.abs(tvx) < VELOCITY_EPSILON
        ? vx * factor
        : vx + (tvx - vx) * kApproach;
    nvy =
      Math.abs(tvy) < VELOCITY_EPSILON
        ? vy * factor
        : vy + (tvy - vy) * kApproach;
  }

  // Integrate.
  let nx = ox + nvx * tau;
  let ny = oy + nvy * tau;

  // Clamp offset; zero the clamped velocity component so the camera cannot
  // keep pushing into (or bounce off) a world edge.
  if (bounds) {
    if (Number.isFinite(bounds.minX) && nx < bounds.minX) {
      nx = bounds.minX;
      nvx = 0;
    }
    if (Number.isFinite(bounds.maxX) && nx > bounds.maxX) {
      nx = bounds.maxX;
      nvx = 0;
    }
    if (Number.isFinite(bounds.minY) && ny < bounds.minY) {
      ny = bounds.minY;
      nvy = 0;
    }
    if (Number.isFinite(bounds.maxY) && ny > bounds.maxY) {
      ny = bounds.maxY;
      nvy = 0;
    }
  }

  return {
    offset: { x: nx, y: ny },
    velocity: { x: nvx, y: nvy },
  };
}

/**
 * Can the camera center on this animal? True iff the animal's world position
 * lies within the "reachable envelope": `[vw/2, world.w - vw/2]` on x and
 * `[vh/2, world.h - vh/2]` on y. Outside this envelope, the crosshair (which
 * is pinned to the viewport center) cannot be panned onto the animal.
 *
 * @param {{x:number,y:number}} animal   animal center in WORLD coords
 * @param {{w:number,h:number}} world     world dimensions (px)
 * @param {{w:number,h:number}} viewport  CSS-px viewport size
 * @returns {boolean}
 */
export function animalReachable(animal, world, viewport) {
  if (!animal || !world || !viewport) return false;
  const ax = Number.isFinite(animal.x) ? animal.x : 0;
  const ay = Number.isFinite(animal.y) ? animal.y : 0;
  const ww = Number.isFinite(world.w) ? world.w : 0;
  const wh = Number.isFinite(world.h) ? world.h : 0;
  const vw = Number.isFinite(viewport.w) ? viewport.w : 0;
  const vh = Number.isFinite(viewport.h) ? viewport.h : 0;

  // If the world is smaller than the viewport on an axis, the envelope is
  // empty; only an animal at the origin (or inside a degenerate span) is
  // reachable. We still return true when the animal's coord lies in
  // [vw/2, ww - vw/2] OR the world is too small to pan at all (the camera
  // is locked at origin and can still center whatever is within view).
  const xOK = ww <= vw ? ax >= 0 && ax <= ww : ax >= vw / 2 && ax <= ww - vw / 2;
  const yOK = wh <= vh ? ay >= 0 && ay <= wh : ay >= vh / 2 && ay <= wh - vh / 2;
  return xOK && yOK;
}

/**
 * Camera pan bounds for a world/viewport pair: `{ minX, maxX, minY, maxY }`.
 * The camera offset's max is `world - viewport`, so the viewport stops flush
 * with the world edge. If the viewport is larger than the world on an axis,
 * max collapses to 0 (camera locked at origin).
 *
 * @param {{w:number,h:number}} world
 * @param {{w:number,h:number}} viewport
 * @returns {{minX:number,maxX:number,minY:number,maxY:number}}
 */
export function boundsFor(world, viewport) {
  const ww = world && Number.isFinite(world.w) ? world.w : 0;
  const wh = world && Number.isFinite(world.h) ? world.h : 0;
  const vw = viewport && Number.isFinite(viewport.w) ? viewport.w : 0;
  const vh = viewport && Number.isFinite(viewport.h) ? viewport.h : 0;
  return {
    minX: 0,
    maxX: Math.max(0, ww - vw),
    minY: 0,
    maxY: Math.max(0, wh - vh),
  };
}

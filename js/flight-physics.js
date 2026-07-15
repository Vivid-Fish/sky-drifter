/**
 * Arcade flight physics model — structurally correct aerodynamics, tuned for fun.
 *
 * Model overview:
 *   - Lift depends on speed² and angle-of-attack (AoA) via a CL curve that stalls.
 *   - Drag has parasitic (∝ speed²) and induced (∝ 1/speed²) components.
 *   - Gravity is constant downward.
 *   - Ground effect boosts lift near the surface.
 *   - All functions are pure and deterministic for testing.
 *
 * Units: speed in m/s, angles in radians, forces as acceleration (m/s²).
 * The aircraft mass is normalized to 1 — forces are accelerations directly.
 */

// ─── Constants ────────────────────────────────────────────────────────
const GRAVITY = 9.81;          // m/s² downward
const LIFT_SCALE = 0.012;      // tuned: lift coefficient scaling for arcade feel
const DRAG_PARASITIC = 0.003;  // parasite drag coefficient (form + skin friction)
const DRAG_INDUCED = 0.08;     // induced drag factor (∝ 1/speed² at low speed)
const STALL_AOA = 0.45;        // ~25° — angle of attack where stall begins
const STALL_RECOVERY = 0.3;    // radians — how quickly CL recovers after stall
const MIN_SPEED = 20;          // m/s — minimum controllable speed (prevents stop-dead)
const GROUND_EFFECT_ALT = 30;  // meters — altitude below which ground effect applies
const GROUND_EFFECT_BOOST = 0.25; // lift boost fraction in ground effect

// ─── Lift Coefficient Curve ───────────────────────────────────────────
/**
 * Compute CL (lift coefficient) from angle of attack.
 *
 * Linear region: CL = 2π × AoA (thin airfoil theory, per radian)
 * Stall region: CL peaks then drops sharply past STALL_AOA.
 * Symmetric for negative AoA (inverted flight).
 *
 * @param {number} aoa — angle of attack in radians
 * @returns {number} lift coefficient
 */
export function getLiftCoefficient(aoa) {
  const absAoa = Math.abs(aoa);

  if (absAoa <= STALL_AOA) {
    // Linear lift region: 2π ≈ 6.28 per radian, scaled for arcade feel
    return aoa * 6.28 * 0.5; // 0.5 scale keeps numbers manageable
  }

  // Post-stall: lift drops rapidly
  const stallExcess = absAoa - STALL_AOA;
  const sign = Math.sign(aoa);
  // CL peaks at ~0.8 at stall_AOA, then drops to ~0.2 at 2× stall_AOA
  const peakCL = STALL_AOA * 6.28 * 0.5; // ~1.4
  const dropOff = Math.exp(-stallExcess / STALL_RECOVERY);
  return sign * peakCL * (0.15 + 0.85 * dropOff);
}

// ─── Drag Coefficient ─────────────────────────────────────────────────
/**
 * Compute total drag coefficient from speed and lift coefficient.
 *
 * Drag polar: CD = CD₀ + CL² / (π × AR × e)
 * Simplified: CD = parasitic + induced × CL²
 *
 * @param {number} speed — airspeed in m/s
 * @param {number} cl — lift coefficient (from getLiftCoefficient)
 * @returns {number} drag coefficient
 */
export function getDragCoefficient(speed, cl) {
  const speedClamped = Math.max(speed, 1); // avoid division by zero
  // Parasitic drag (constant) + induced drag (∝ CL² / speed²)
  return DRAG_PARASITIC + (DRAG_INDUCED * cl * cl) / (speedClamped * speedClamped);
}

// ─── Ground Effect ────────────────────────────────────────────────────
/**
 * Compute ground effect lift multiplier.
 * Below GROUND_EFFECT_ALT, lift is boosted (wings interact with surface).
 *
 * @param {number} altitude — meters above surface
 * @returns {number} lift multiplier (1.0 = no effect, up to 1.25)
 */
export function getGroundEffect(altitude) {
  if (altitude >= GROUND_EFFECT_ALT) return 1.0;
  const ratio = Math.max(0, altitude / GROUND_EFFECT_ALT);
  // Smooth falloff: at 0m → 1 + boost, at GROUND_EFFECT_ALT → 1.0
  return 1.0 + GROUND_EFFECT_BOOST * (1.0 - ratio) * (1.0 - ratio);
}

// ─── Acceleration Computation ─────────────────────────────────────────
/**
 * Compute acceleration vector from flight state.
 *
 * @param {object} state
 * @param {number} state.speed — airspeed m/s
 * @param {number} state.pitch — pitch rate (positive = nose up)
 * @param {number} state.roll — roll angle in radians
 * @param {number} state.altitude — meters above surface
 * @param {number} state.throttle — 0..1
 * @returns {{ verticalAccel: number, dragAccel: number, liftAccel: number, cl: number, cd: number, isStalling: boolean }}
 */
export function computeAccelerations(state) {
  const { speed, pitch, altitude, throttle } = state;

  // Angle of attack: pitch rate maps to AoA
  // In arcade model, pitch input directly drives AoA
  const aoa = pitch;

  // Lift
  const cl = getLiftCoefficient(aoa);
  const groundEffect = getGroundEffect(altitude);
  // Lift force ∝ speed² × CL × scale
  const liftAccel = LIFT_SCALE * speed * speed * Math.abs(cl) * groundEffect;

  // Drag
  const cd = getDragCoefficient(speed, cl);
  const dragAccel = DRAG_PARASITIC + cd * speed * speed;

  // Thrust: throttle maps to forward acceleration
  const thrustAccel = throttle * 25; // max 25 m/s² forward accel

  // Net vertical: lift opposes gravity
  const liftDirection = Math.sign(cl) || 0; // 0 when cl is exactly 0
  const verticalAccel = liftDirection * liftAccel - GRAVITY;

  // Stall detection: high AoA + low speed
  const isStalling = Math.abs(aoa) > STALL_AOA * 0.7 && speed < 80;

  return {
    verticalAccel,
    dragAccel,
    liftAccel: liftDirection * liftAccel,
    thrustAccel,
    cl,
    cd,
    isStalling,
  };
}

// ─── Speed Step (backward compatible) ─────────────────────────────────
/**
 * Pure speed-step for deterministic testing.
 * Matches the speed update in the main game loop.
 *
 * @param {number} speed — current speed m/s
 * @param {number} throttle — 0..1
 * @param {number} multiplier — boost multiplier (1 = normal, 1.8 = boosted)
 * @param {number} dt — delta time in seconds
 * @returns {number} new speed
 */
export function stepSpeed(speed, throttle, multiplier, dt) {
  const target = (30 + throttle * 150) * multiplier;
  return speed + (target - speed) * dt * 0.5;
}

// ─── Full Physics Step ────────────────────────────────────────────────
/**
 * Compute full physics delta for one frame.
 * Pure function — returns deltas, does not mutate state.
 *
 * @param {object} plane — current flight state
 * @param {number} plane.speed
 * @param {number} plane.pitch
 * @param {number} plane.roll
 * @param {number} plane.throttle
 * @param {number} planeAlt — altitude above surface
 * @param {number} boostMultiplier — from boost system
 * @param {number} dt — delta time
 * @returns {{ speedDelta: number, verticalVelocityDelta: number, isStalling: boolean, cl: number, cd: number, gForce: number }}
 */
export function stepPhysics(plane, planeAlt, boostMultiplier, dt) {
  const accel = computeAccelerations({
    speed: plane.speed,
    pitch: plane.pitch,
    roll: plane.roll,
    altitude: planeAlt,
    throttle: plane.throttle,
  });

  // Speed: thrust minus drag, with boost multiplier
  const effectiveThrust = accel.thrustAccel * boostMultiplier;
  const speedDelta = (effectiveThrust - accel.dragAccel) * dt;
  const newSpeed = Math.max(MIN_SPEED, plane.speed + speedDelta);

  // Vertical velocity from lift + gravity
  // pitch also contributes to vertical component of forward velocity
  const pitchVertical = -Math.sin(plane.pitch) * newSpeed;
  const verticalVelocityDelta = accel.verticalAccel * dt + pitchVertical * dt;

  // G-force: load factor from bank angle + vertical acceleration
  const loadFactor = 1 / Math.max(0.25, Math.cos(Math.abs(plane.roll)));
  const gFromLift = Math.abs(accel.liftAccel) / GRAVITY;
  const gForce = Math.min(loadFactor + gFromLift * 0.3, 9.9);

  return {
    speedDelta,
    newSpeed,
    verticalVelocityDelta,
    isStalling: accel.isStalling,
    cl: accel.cl,
    cd: accel.cd,
    gForce,
    liftAccel: accel.liftAccel,
  };
}

// ─── Expose constants for tests ───────────────────────────────────────
export const PHYSICS = {
  GRAVITY,
  LIFT_SCALE,
  DRAG_PARASITIC,
  DRAG_INDUCED,
  STALL_AOA,
  STALL_RECOVERY,
  MIN_SPEED,
  GROUND_EFFECT_ALT,
  GROUND_EFFECT_BOOST,
};

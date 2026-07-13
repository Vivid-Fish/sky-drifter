// Boost system — deterministic state machine
// Pure: no DOM, no audio, no window globals. Only math and state.
//
// Explicit transition model (dt-independent invariants):
//   INACTIVE + requested + energy >= MIN_ENERGY  → ACTIVE      (activation edge)
//   ACTIVE + requested                           → stay ACTIVE, drain
//   ACTIVE + energy → 0                          → INACTIVE + exhausted
//   INACTIVE + exhausted + requested             → stay INACTIVE, recharge
//   !requested                                   → INACTIVE, recharge, clear exhausted
//
// MIN_ENERGY gates only the inactive→active transition. Once active,
// drain runs to zero regardless. No frame-size chatter.

const MAX_ENERGY = 100;
const DRAIN_RATE = 30;      // energy per second while boosting
const RECHARGE_RATE = 10;   // energy per second while idle
const SPEED_MULTIPLIER = 1.8;
const MIN_ENERGY = 5;       // minimum energy to activate

let energy = MAX_ENERGY;
let active = false;
let exhausted = false;

/**
 * @param {number} dt — frame delta in seconds (clamped to >= 0)
 * @param {boolean} requested — true when player is holding boost input
 * @returns {{ active: boolean, energy: number, multiplier: number, activated: boolean }}
 */
export function update(dt, requested) {
  // Guard: clamp dt
  if (!Number.isFinite(dt) || dt < 0) dt = 0;

  const prevActive = active;

  if (!requested) {
    // Release: always inactive, always recharge, clear latch
    active = false;
    exhausted = false;
    energy = Math.min(MAX_ENERGY, energy + RECHARGE_RATE * dt);
  } else if (active) {
    // Already active: drain; if hits zero → exhausted
    energy -= DRAIN_RATE * dt;
    if (energy <= 0) {
      energy = 0;
      active = false;
      exhausted = true;
    }
    // else: stay active, no recharge
  } else if (exhausted) {
    // Exhausted + still holding: stay inactive, recharge
    energy = Math.min(MAX_ENERGY, energy + RECHARGE_RATE * dt);
  } else {
    // Inactive, not exhausted, requested: gate on MIN_ENERGY
    if (energy >= MIN_ENERGY) {
      active = true;
      // Drain on activation frame too
      energy -= DRAIN_RATE * dt;
      if (energy <= 0) {
        energy = 0;
        active = false;
        exhausted = true;
      }
    } else {
      // Not enough energy: recharge while waiting
      energy = Math.min(MAX_ENERGY, energy + RECHARGE_RATE * dt);
    }
  }

  return {
    active,
    energy,
    multiplier: active ? SPEED_MULTIPLIER : 1,
    activated: active && !prevActive,
  };
}

/** Reset to full — for tests */
export function reset() {
  energy = MAX_ENERGY;
  active = false;
  exhausted = false;
}

/** Expose constants for tests */
export const BOOST = { MAX_ENERGY, DRAIN_RATE, RECHARGE_RATE, SPEED_MULTIPLIER, MIN_ENERGY };

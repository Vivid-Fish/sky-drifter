/** Pure speed-step for deterministic testing.
 *  Matches the speed lerp in main.js exactly. */
export function stepSpeed(speed, throttle, multiplier, dt) {
  const target = (30 + throttle * 150) * multiplier;
  return speed + (target - speed) * dt * 0.5;
}

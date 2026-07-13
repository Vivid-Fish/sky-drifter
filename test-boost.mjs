// Deterministic unit tests for boost state machine + flight physics
import { update, reset, BOOST } from './js/boost.js';
import { createHoldSource } from './js/hold-source.js';
import { stepSpeed } from './js/flight-physics.js';
import { strict as assert } from 'node:assert';

let failed = 0;
let passed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

console.log('=== Boost State Machine Tests ===\n');

// ── Constants ──
test('MAX_ENERGY is 100', () => assert.equal(BOOST.MAX_ENERGY, 100));
test('DRAIN_RATE is 30/s', () => assert.equal(BOOST.DRAIN_RATE, 30));
test('RECHARGE_RATE is 10/s', () => assert.equal(BOOST.RECHARGE_RATE, 10));
test('SPEED_MULTIPLIER is 1.8', () => assert.equal(BOOST.SPEED_MULTIPLIER, 1.8));
test('MIN_ENERGY is 5', () => assert.equal(BOOST.MIN_ENERGY, 5));

// ── Initial state ──
reset();
test('starts with full energy, inactive', () => {
  const r = update(0, false);
  assert.equal(r.energy, 100);
  assert.equal(r.active, false);
  assert.equal(r.multiplier, 1);
  assert.equal(r.activated, false);
});

// ── Activation ──
reset();
test('activates when requested with enough energy', () => {
  const r = update(0, true);
  assert.equal(r.active, true);
  assert.equal(r.activated, true);
  assert.equal(r.multiplier, BOOST.SPEED_MULTIPLIER);
});

reset();
test('does not activate below MIN_ENERGY', () => {
  update(3.2, true); // drain to 4
  update(0, false);  // release (clears exhausted)
  const r = update(0, true);
  assert.equal(r.active, false);
  assert.equal(r.activated, false);
});

// ── Activation edge fires once ──
reset();
test('activated edge fires only on first frame', () => {
  const r1 = update(0.1, true);
  assert.equal(r1.activated, true);
  const r2 = update(0.1, true);
  assert.equal(r2.activated, false);
});

// ── Drain ──
reset();
test('drains at DRAIN_RATE while active', () => {
  const r = update(1, true);
  assert.equal(r.active, true);
  assert.equal(r.energy, 70); // 100 - 30*1
});

reset();
test('drains to zero and sets exhausted', () => {
  const r = update(4, true); // 100 - 120 = 0
  assert.equal(r.energy, 0);
  assert.equal(r.active, false);
  // Verify exhausted by checking repress while still holding
  const r2 = update(0, true);
  assert.equal(r2.active, false);
});

// ── Exhausted latch (anti-chatter) ──
reset();
test('no reactivation while holding after depletion', () => {
  update(4, true);  // deplete → exhausted
  update(2, true);  // recharge to 20 while holding, still exhausted
  assert.equal(update(0, true).active, false);
});

reset();
test('reactivates after release and repress', () => {
  update(4, true);   // deplete → exhausted
  update(1, false);  // release → exhausted cleared, energy = 10
  const r = update(0, true); // repress
  assert.equal(r.active, true);
  assert.equal(r.activated, true);
});

reset();
test('one activation edge per press even after depletion cycle', () => {
  update(4, true);   // deplete
  update(1, false);  // release
  let edges = 0;
  for (let i = 0; i < 20; i++) {
    const r = update(0.1, true);
    if (r.activated) edges++;
  }
  assert.equal(edges, 1);
});

// ── Recharge ──
reset();
test('recharges at RECHARGE_RATE when inactive', () => {
  update(2, true);  // drain to 40
  const r = update(3, false); // recharge 30
  assert.equal(r.energy, 70);
  assert.equal(r.active, false);
});

reset();
test('energy caps at MAX_ENERGY', () => {
  update(2, true);  // drain to 40
  const r = update(20, false);
  assert.equal(r.energy, 100);
});

// ── Partial drain then release ──
reset();
test('can reactivate after partial drain and release', () => {
  update(2, true);    // drain to 40
  update(1, false);   // release, recharge to 50
  const r = update(0, true);
  assert.equal(r.active, true);
  assert.equal(r.activated, true);
});

// ── dt guards ──
reset();
test('negative dt clamped to 0', () => {
  const r = update(-1, false);
  assert.equal(r.energy, 100);
});

reset();
test('NaN dt clamped to 0', () => {
  const r = update(NaN, false);
  assert.equal(r.energy, 100);
});

reset();
test('Infinity dt clamped to 0', () => {
  const r = update(Infinity, false);
  assert.equal(r.energy, 100);
});

// ── Sustained boost ──
reset();
test('sustained boost drains continuously', () => {
  const r1 = update(0.5, true);
  assert.equal(r1.energy, 85);
  const r2 = update(0.5, true);
  assert.equal(r2.energy, 70);
});

// ── Zero dt ──
reset();
test('zero dt does not change state', () => {
  update(1, true);
  const r = update(0, true);
  assert.equal(r.energy, 70);
  assert.equal(r.active, true);
});

// ── Hold-source ownership (production code) ──
test('single pointer activates and releases', () => {
  const h = createHoldSource();
  assert.equal(h.active, false);
  h.addPointer(1);
  assert.equal(h.active, true);
  h.removePointer(1);
  assert.equal(h.active, false);
});

test('two pointers — releasing one keeps active', () => {
  const h = createHoldSource();
  h.addPointer(1);
  h.addPointer(2);
  assert.equal(h.active, true);
  h.removePointer(1);
  assert.equal(h.active, true);
  h.removePointer(2);
  assert.equal(h.active, false);
});

test('pointer + keyboard — releasing pointer keeps active', () => {
  const h = createHoldSource();
  h.addPointer(1);
  h.setKeyboard(true);
  assert.equal(h.active, true);
  h.removePointer(1);
  assert.equal(h.active, true);
  h.setKeyboard(false);
  assert.equal(h.active, false);
});

test('duplicate add/remove is idempotent', () => {
  const h = createHoldSource();
  h.addPointer(1);
  h.addPointer(1);
  assert.equal(h.active, true);
  h.removePointer(1);
  assert.equal(h.active, false);
});

test('remove nonexistent pointer is safe', () => {
  const h = createHoldSource();
  h.removePointer(999);
  assert.equal(h.active, false);
  h.addPointer(1);
  h.removePointer(999);
  assert.equal(h.active, true);
});

test('clearAll resets everything', () => {
  const h = createHoldSource();
  h.addPointer(1);
  h.addPointer(2);
  h.setKeyboard(true);
  h.clearAll();
  assert.equal(h.active, false);
});

// ─── Flight physics: deterministic speed oracle ───────────────────
test('stepSpeed: boosted > unboosted from equal state', () => {
  const speed = 100, throttle = 1.0, dt = 1;
  const unboosted = stepSpeed(speed, throttle, 1, dt);
  const boosted = stepSpeed(speed, throttle, 1.8, dt);
  assert.ok(boosted > unboosted,
    `boosted ${boosted.toFixed(1)} must exceed unboosted ${unboosted.toFixed(1)}`);
});

test('stepSpeed: multiplier effect is proportional', () => {
  const speed = 100, throttle = 1.0, dt = 1;
  const unboosted = stepSpeed(speed, throttle, 1, dt);
  const boosted = stepSpeed(speed, throttle, 1.8, dt);
  // At speed=100, throttle=1, target=180 boosted vs 180 unboosted.
  // delta per tick = (target - speed) * dt * 0.5
  // boosted delta = (180-100)*0.5 = 40, unboosted = (180-100)*0.5 = 40... wait
  // target for unboosted = (30+150)*1 = 180, boosted = 180*1.8 = 324
  // unboosted: 100 + (180-100)*0.5 = 140
  // boosted: 100 + (324-100)*0.5 = 212
  assert.ok(boosted > unboosted * 1.3,
    `boosted ${boosted.toFixed(1)} should be materially higher than ${unboosted.toFixed(1)}`);
});

// ── Summary ──
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

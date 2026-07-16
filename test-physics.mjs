// Deterministic unit tests for flight physics model
import {
  getLiftCoefficient,
  getDragCoefficient,
  getGroundEffect,
  computeAccelerations,
  stepPhysics,
  stepSpeed,
  PHYSICS,
} from './js/flight-physics.js';
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

console.log('=== Flight Physics Model Tests ===\n');

// ─── Constants ────────────────────────────────────────────────────────
test('GRAVITY is 9.81', () => assert.equal(PHYSICS.GRAVITY, 9.81));
test('STALL_AOA is ~25° (0.45 rad)', () => assert.ok(PHYSICS.STALL_AOA > 0.3 && PHYSICS.STALL_AOA < 0.6));
test('MIN_SPEED is 20 m/s', () => assert.equal(PHYSICS.MIN_SPEED, 20));
test('GROUND_EFFECT_ALT is 30m', () => assert.equal(PHYSICS.GROUND_EFFECT_ALT, 30));

// ─── Lift Coefficient Curve ──────────────────────────────────────────
console.log('\n--- Lift Coefficient ---');

test('CL at zero AoA is zero', () => {
  assert.ok(Math.abs(getLiftCoefficient(0)) < 0.001);
});

test('CL increases linearly in pre-stall region', () => {
  const cl1 = getLiftCoefficient(0.1);
  const cl2 = getLiftCoefficient(0.2);
  assert.ok(cl2 > cl1, `CL(0.2)=${cl2} should exceed CL(0.1)=${cl1}`);
  // Roughly linear: ratio should be ~2
  assert.ok(cl2 / cl1 > 1.5 && cl2 / cl1 < 2.5, `ratio ${cl2 / cl1} not ~2`);
});

test('CL peaks near stall AoA', () => {
  const preStall = getLiftCoefficient(PHYSICS.STALL_AOA * 0.9);
  const atStall = getLiftCoefficient(PHYSICS.STALL_AOA);
  const postStall = getLiftCoefficient(PHYSICS.STALL_AOA * 1.5);
  assert.ok(atStall > preStall * 0.9, 'CL should be near peak at stall_AOA');
  assert.ok(atStall > postStall, `CL at stall ${atStall} > post-stall ${postStall}`);
});

test('CL drops after stall', () => {
  const atStall = getLiftCoefficient(PHYSICS.STALL_AOA);
  const deep = getLiftCoefficient(PHYSICS.STALL_AOA * 3);
  assert.ok(deep < atStall * 0.5, `deep stall CL ${deep} should be < 50% of peak ${atStall}`);
});

test('CL is symmetric for negative AoA', () => {
  const clPos = getLiftCoefficient(0.2);
  const clNeg = getLiftCoefficient(-0.2);
  assert.ok(Math.abs(clPos + clNeg) < 0.01, `CL should be odd: ${clPos} vs ${clNeg}`);
});

test('CL is negative for negative AoA', () => {
  assert.ok(getLiftCoefficient(-0.3) < 0);
});

// ─── Drag Coefficient ────────────────────────────────────────────────
console.log('\n--- Drag Coefficient ---');

test('CD is always positive', () => {
  for (const speed of [20, 50, 100, 150]) {
    for (const cl of [-1, 0, 0.5, 1, 1.5]) {
      const cd = getDragCoefficient(speed, cl);
      assert.ok(cd > 0, `CD(${speed}, ${cl}) = ${cd} should be > 0`);
    }
  }
});

test('CD increases with CL²', () => {
  const cdLow = getDragCoefficient(80, 0.2);
  const cdHigh = getDragCoefficient(80, 1.0);
  assert.ok(cdHigh > cdLow, `CD at high CL should exceed low CL`);
});

test('CD has speed-independent parasitic component', () => {
  // At zero CL, CD should be close to parasitic (speed-independent base)
  const cd = getDragCoefficient(100, 0);
  assert.ok(cd >= PHYSICS.DRAG_PARASITIC, `CD at CL=0 should be >= parasitic`);
});

// ─── Ground Effect ───────────────────────────────────────────────────
console.log('\n--- Ground Effect ---');

test('no ground effect above GROUND_EFFECT_ALT', () => {
  assert.ok(Math.abs(getGroundEffect(PHYSICS.GROUND_EFFECT_ALT) - 1.0) < 0.001);
  assert.ok(Math.abs(getGroundEffect(100) - 1.0) < 0.001);
});

test('ground effect boosts lift near surface', () => {
  const atSurface = getGroundEffect(0);
  assert.ok(atSurface > 1.0, `ground effect at 0m should be > 1: ${atSurface}`);
  assert.ok(atSurface <= 1 + PHYSICS.GROUND_EFFECT_BOOST);
});

test('ground effect fades smoothly', () => {
  const g0 = getGroundEffect(0);
  const g10 = getGroundEffect(10);
  const g20 = getGroundEffect(20);
  const g30 = getGroundEffect(30);
  assert.ok(g0 > g10, 'should decrease with altitude');
  assert.ok(g10 > g20, 'should decrease with altitude');
  assert.ok(g20 > g30, 'should decrease with altitude');
});

// ─── Acceleration Computation ────────────────────────────────────────
console.log('\n--- Acceleration Computation ---');

test('gravity pulls down at zero lift', () => {
  const a = computeAccelerations({ speed: 0, pitch: 0, roll: 0, altitude: 100, throttle: 0 });
  assert.ok(a.verticalAccel < 0, `vertical accel should be negative: ${a.verticalAccel}`);
  assert.ok(Math.abs(a.verticalAccel + PHYSICS.GRAVITY) < 0.1, 'should be ~-g');
});

test('positive pitch generates upward lift at speed', () => {
  const a = computeAccelerations({ speed: 80, pitch: 0.3, roll: 0, altitude: 100, throttle: 0.5 });
  // At 80 m/s with moderate AoA, lift should overcome gravity
  assert.ok(a.liftAccel > 0, 'positive pitch should generate positive lift');
});

test('high AoA triggers stall flag', () => {
  const a = computeAccelerations({ speed: 50, pitch: 0.5, roll: 0, altitude: 100, throttle: 0.5 });
  assert.ok(a.isStalling, 'pitch=0.5 at speed=50 should be stalling');
});

test('negative pitch does not trigger stall', () => {
  const a = computeAccelerations({ speed: 30, pitch: -1.0, roll: 0, altitude: 100, throttle: 0.5 });
  assert.ok(!a.isStalling, 'diving should not trigger stall');
});

test('high speed avoids stall even at moderate AoA', () => {
  const a = computeAccelerations({ speed: 150, pitch: 0.3, roll: 0, altitude: 100, throttle: 0.5 });
  assert.ok(!a.isStalling, 'high speed should prevent stall at moderate AoA');
});

test('throttle generates thrust acceleration', () => {
  const a0 = computeAccelerations({ speed: 80, pitch: 0, roll: 0, altitude: 100, throttle: 0 });
  const a1 = computeAccelerations({ speed: 80, pitch: 0, roll: 0, altitude: 100, throttle: 1 });
  assert.ok(a1.thrustAccel > a0.thrustAccel, 'full throttle > zero throttle');
});

// ─── Full Physics Step ───────────────────────────────────────────────
console.log('\n--- Full Physics Step ---');

const basePlane = { speed: 80, pitch: 0.1, roll: 0, throttle: 0.5 };

test('stepPhysics returns all expected fields', () => {
  const r = stepPhysics(basePlane, 100, 1, 0.016);
  assert.ok('speedDelta' in r);
  assert.ok('newSpeed' in r);
  assert.ok('verticalVelocityDelta' in r);
  assert.ok('isStalling' in r);
  assert.ok('gForce' in r);
});

test('speed never drops below MIN_SPEED', () => {
  const r = stepPhysics({ speed: 5, pitch: 0, roll: 0, throttle: 0 }, 100, 1, 1);
  assert.ok(r.newSpeed >= PHYSICS.MIN_SPEED, `speed ${r.newSpeed} < MIN_SPEED ${PHYSICS.MIN_SPEED}`);
});

test('full throttle increases speed', () => {
  const r = stepPhysics({ speed: 50, pitch: 0, roll: 0, throttle: 1 }, 100, 1, 0.016);
  assert.ok(r.newSpeed > 50, `speed should increase: ${r.newSpeed}`);
});

test('zero throttle + drag decreases speed', () => {
  const r = stepPhysics({ speed: 150, pitch: 0, roll: 0, throttle: 0 }, 100, 1, 0.016);
  assert.ok(r.newSpeed < 150, `speed should decrease: ${r.newSpeed}`);
});

test('boost multiplier increases speed gain', () => {
  const normal = stepPhysics({ speed: 80, pitch: 0, roll: 0, throttle: 0.8 }, 100, 1, 0.016);
  const boosted = stepPhysics({ speed: 80, pitch: 0, roll: 0, throttle: 0.8 }, 100, 1.8, 0.016);
  assert.ok(boosted.newSpeed > normal.newSpeed, `boosted ${boosted.newSpeed} > normal ${normal.newSpeed}`);
});

test('stall detected at high AoA + low speed', () => {
  const r = stepPhysics({ speed: 50, pitch: 0.5, roll: 0, throttle: 0.3 }, 100, 1, 0.016);
  assert.ok(r.isStalling, 'should be stalling');
});

test('no stall at moderate AoA + high speed', () => {
  const r = stepPhysics({ speed: 150, pitch: 0.2, roll: 0, throttle: 0.8 }, 100, 1, 0.016);
  assert.ok(!r.isStalling, 'should not be stalling');
});

test('G-force increases with bank angle', () => {
  const level = stepPhysics({ speed: 80, pitch: 0, roll: 0, throttle: 0.5 }, 100, 1, 0.016);
  const banked = stepPhysics({ speed: 80, pitch: 0, roll: 1.2, throttle: 0.5 }, 100, 1, 0.016);
  assert.ok(banked.gForce > level.gForce, `banked G ${banked.gForce} > level G ${level.gForce}`);
});

test('G-force capped at 9.9', () => {
  const r = stepPhysics({ speed: 80, pitch: 0, roll: 3.14, throttle: 0.5 }, 100, 1, 0.016);
  assert.ok(r.gForce <= 9.9, `G ${r.gForce} should be capped`);
});

test('ground effect increases lift near surface', () => {
  const high = stepPhysics({ speed: 80, pitch: 0.2, roll: 0, throttle: 0.5 }, 200, 1, 0.016);
  const low = stepPhysics({ speed: 80, pitch: 0.2, roll: 0, throttle: 0.5 }, 5, 1, 0.016);
  assert.ok(Math.abs(low.liftAccel) > Math.abs(high.liftAccel),
    `ground effect: low ${Math.abs(low.liftAccel).toFixed(2)} > high ${Math.abs(high.liftAccel).toFixed(2)}`);
});

// ─── Backward Compatibility: stepSpeed ────────────────────────────────
console.log('\n--- Backward Compatibility ---');

test('stepSpeed unchanged: boosted > unboosted', () => {
  const unboosted = stepSpeed(100, 1.0, 1, 1);
  const boosted = stepSpeed(100, 1.0, 1.8, 1);
  assert.ok(boosted > unboosted);
});

test('stepSpeed: deterministic', () => {
  const a = stepSpeed(80, 0.5, 1, 0.016);
  const b = stepSpeed(80, 0.5, 1, 0.016);
  assert.equal(a, b);
});

// ─── Summary ──────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

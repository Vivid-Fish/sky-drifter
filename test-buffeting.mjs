// Deterministic unit tests for stall buffeting system
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

console.log('=== Stall Buffeting Tests ===\n');

// ─── Buffeting Ramp Logic ─────────────────────────────────────────
// Replicate the buffeting update logic for testing
function stepBuffeting(state, dt, isStalling) {
  state.targetIntensity = isStalling ? 1 : 0;
  const rampUp = isStalling ? 8 : 3; // fast attack, slower release
  state.intensity += (state.targetIntensity - state.intensity) * dt * rampUp;
  state.intensity = Math.max(0, Math.min(1, state.intensity));
  return state;
}

console.log('--- Ramp Up (Stall Entry) ---');

test('buffeting starts at zero', () => {
  const s = { intensity: 0, targetIntensity: 0 };
  stepBuffeting(s, 0.016, false);
  assert.equal(s.intensity, 0);
});

test('buffeting ramps up quickly on stall entry', () => {
  const s = { intensity: 0, targetIntensity: 0 };
  // After 1 frame at 60fps
  stepBuffeting(s, 0.016, true);
  assert.ok(s.intensity > 0, 'should start ramping');
  assert.ok(s.intensity < 1, 'should not instantly reach 1');
});

test('buffeting reaches ~1 within ~0.5s', () => {
  const s = { intensity: 0, targetIntensity: 0 };
  // Simulate 30 frames at 60fps (~0.5s)
  for (let i = 0; i < 30; i++) {
    stepBuffeting(s, 0.016, true);
  }
  assert.ok(s.intensity > 0.9, `should reach ~1 within 0.5s: got ${s.intensity.toFixed(3)}`);
});

test('buffeting stays at 1 during sustained stall', () => {
  const s = { intensity: 0, targetIntensity: 0 };
  for (let i = 0; i < 100; i++) {
    stepBuffeting(s, 0.016, true);
  }
  assert.ok(Math.abs(s.intensity - 1) < 0.01, `should stay at 1: got ${s.intensity.toFixed(3)}`);
});

console.log('\n--- Ramp Down (Stall Recovery) ---');

test('buffeting decays slowly on recovery', () => {
  const s = { intensity: 1, targetIntensity: 1 };
  // Recover from stall
  stepBuffeting(s, 0.016, false);
  assert.ok(s.intensity < 1, 'should start decaying');
  assert.ok(s.intensity > 0.8, 'should decay slowly: got ' + s.intensity.toFixed(3));
});

test('buffeting reaches ~0 within ~2s', () => {
  const s = { intensity: 1, targetIntensity: 1 };
  // Simulate 120 frames at 60fps (~2s)
  for (let i = 0; i < 120; i++) {
    stepBuffeting(s, 0.016, false);
  }
  assert.ok(s.intensity < 0.1, `should reach ~0 within 2s: got ${s.intensity.toFixed(3)}`);
});

console.log('\n--- Edge Cases ---');

test('buffeting handles zero dt', () => {
  const s = { intensity: 0.5, targetIntensity: 0.5 };
  stepBuffeting(s, 0, true);
  assert.equal(s.intensity, 0.5, 'zero dt should not change state');
});

test('buffeting handles negative dt', () => {
  const s = { intensity: 0, targetIntensity: 0 };
  stepBuffeting(s, -0.016, true);
  assert.ok(s.intensity >= 0, 'negative dt should not make intensity negative');
});

test('buffeting clamped to [0, 1]', () => {
  const s = { intensity: 1.5, targetIntensity: 1.5 };
  stepBuffeting(s, 0.016, true);
  assert.ok(s.intensity <= 1, `should be clamped to 1: got ${s.intensity.toFixed(3)}`);
});

test('rapid stall/recovery cycles don\'t explode', () => {
  const s = { intensity: 0, targetIntensity: 0 };
  for (let i = 0; i < 200; i++) {
    stepBuffeting(s, 0.016, i % 2 === 0);
  }
  assert.ok(s.intensity >= 0 && s.intensity <= 1, `should stay bounded: ${s.intensity.toFixed(3)}`);
});

// ─── Shake Application ───────────────────────────────────────────
console.log('\n--- Shake Application ---');

// Replicate the shake logic for testing
function computeShake(time, intensity) {
  if (intensity < 0.01) return { x: 0, y: 0, z: 0 };
  const freq = 40;
  const scale = intensity * 0.15;
  return {
    x: Math.sin(time * freq * Math.PI * 2) * scale * 0.3,
    y: Math.cos(time * freq * 1.7 * Math.PI * 2) * scale * 0.2,
    z: Math.sin(time * freq * 2.3 * Math.PI * 2) * scale * 0.5,
  };
}

test('no shake below threshold', () => {
  const s = computeShake(0, 0.005);
  assert.equal(s.x, 0);
});

test('shake magnitude proportional to intensity', () => {
  const s1 = computeShake(1, 0.5);
  const s2 = computeShake(1, 1.0);
  // At same time, higher intensity → larger shake
  const mag1 = Math.abs(s1.x) + Math.abs(s1.y) + Math.abs(s1.z);
  const mag2 = Math.abs(s2.x) + Math.abs(s2.y) + Math.abs(s2.z);
  assert.ok(mag2 > mag1, `higher intensity should shake more: ${mag2.toFixed(3)} > ${mag1.toFixed(3)}`);
});

test('shake is bounded', () => {
  for (let t = 0; t < 10; t += 0.1) {
    const s = computeShake(t, 1);
    assert.ok(Math.abs(s.x) < 0.1, `x shake bounded: ${s.x.toFixed(3)}`);
    assert.ok(Math.abs(s.y) < 0.1, `y shake bounded: ${s.y.toFixed(3)}`);
    assert.ok(Math.abs(s.z) < 0.1, `z shake bounded: ${s.z.toFixed(3)}`);
  }
});

// ─── Summary ──────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

// Touch joystick, gyro, keyboard, and mouse controls
import { createHoldSource } from './hold-source.js';
export function setupControls(plane) {
  const joy = { l: { x: 0, y: 0, active: false }, r: { x: 0, y: 0, active: false } };
  const DEADZONE = 0.12; // ignore small joystick drift

  function initStick(id, side) {
    const zone = document.getElementById(id);
    const thumb = document.getElementById(id === 'stick-left' ? 'thumb-l' : 'thumb-r');
    const cx = 70, cy = 70, r = 40;

    function start(t) {
      joy[side].active = true;
      thumb.classList.add('active');
      move(t);
    }
    function move(t) {
      const rect = zone.getBoundingClientRect();
      const tx = (t.touches ? t.touches[0].clientX : t.clientX) - rect.left;
      const ty = (t.touches ? t.touches[0].clientY : t.clientY) - rect.top;
      let dx = tx - cx, dy = ty - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) { dx = dx / d * r; dy = dy / d * r; }

      // Apply deadzone
      const rawD = Math.sqrt(dx * dx + dy * dy);
      if (rawD < DEADZONE * r) {
        dx = 0; dy = 0;
      } else {
        const scale = (rawD - DEADZONE * r) / ((1 - DEADZONE) * r);
        dx = (dx / rawD) * r * scale;
        dy = (dy / rawD) * r * scale;
      }

      thumb.style.transform = `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
      joy[side].x = dx / r;
      joy[side].y = dy / r;
    }
    function end() {
      joy[side].active = false;
      joy[side].x = 0;
      joy[side].y = 0;
      thumb.classList.remove('active');
      thumb.style.transform = 'translate(-50%,-50%)';
    }
    thumb.addEventListener('touchstart', (e) => { e.preventDefault(); start(e); }, { passive: false });
    thumb.addEventListener('touchmove', (e) => { e.preventDefault(); move(e); }, { passive: false });
    thumb.addEventListener('touchend', (e) => { e.preventDefault(); end(); }, { passive: false });
    thumb.addEventListener('touchcancel', (e) => { e.preventDefault(); end(); }, { passive: false });
  }
  initStick('stick-left', 'l');
  initStick('stick-right', 'r');

  // Throttle bar (touch)
  const thrFill = document.getElementById('throttle-fill');
  const thrBar = document.getElementById('throttle-bar');
  thrBar.addEventListener('touchstart', (e) => { e.preventDefault(); handleThrottle(e.touches[0]); }, { passive: false });
  thrBar.addEventListener('touchmove', (e) => { e.preventDefault(); handleThrottle(e.touches[0]); }, { passive: false });
  function handleThrottle(t) {
    const rect = thrBar.getBoundingClientRect();
    let p = 1 - (t.clientY - rect.top) / rect.height;
    p = Math.max(0, Math.min(1, p));
    plane.throttle = p;
    thrFill.style.transform = `scaleY(${p})`;
  }

  // Mouse wheel throttle (desktop)
  window.addEventListener('wheel', (e) => {
    plane.throttle = Math.max(0, Math.min(1, plane.throttle - e.deltaY * 0.001));
    if (thrFill) thrFill.style.transform = `scaleY(${plane.throttle})`;
  }, { passive: true });

  // Gyroscope
  let gyroOn = false;
  const gyroBtn = document.getElementById('gyro-btn');
  gyroBtn.addEventListener('click', async () => {
    if (!gyroOn) {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') return; } catch (e) { return; }
      }
      gyroOn = true;
      gyroBtn.classList.add('on');
      gyroBtn.setAttribute('aria-pressed', 'true');
    } else {
      gyroOn = false;
      gyroBtn.classList.remove('on');
      gyroBtn.setAttribute('aria-pressed', 'false');
    }
  });

  let gyroBeta = 0, gyroGamma = 0;
  window.addEventListener('deviceorientation', (e) => {
    if (!gyroOn) return;
    // beta: -180 to 180 (front/back), gamma: -90 to 90 (left/right)
    // Center around 45 degrees (phone held at angle)
    // Increased sensitivity: map ±20° phone tilt to full ±1 control range
    const betaRaw = (e.beta || 0) - 45;
    const gammaRaw = e.gamma || 0;
    gyroBeta = Math.max(-1, Math.min(1, betaRaw / 20));
    gyroGamma = Math.max(-1, Math.min(1, gammaRaw / 20));
  });

  // ─── Keyboard (global) ──────────────────────────────────────────
  // keys maps code -> boolean.  keyup uses capture=true so it always
  // fires even when a focused element (e.g. boost button) calls
  // stopPropagation() on the bubble phase.
  const keys = {};
  const handledKeys = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'Space']);
  window.addEventListener('keydown', (e) => {
    if (!handledKeys.has(e.code)) return;
    keys[e.code] = true;
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    if (handledKeys.has(e.code)) keys[e.code] = false;
  }, { capture: true });

  // ─── Global cleanup (blur / page-hide) ──────────────────────────
  function clearAllInput() {
    for (const k of handledKeys) keys[k] = false;
    boostHold.clearAll();
    if (boostBtn) {
      boostBtn.classList.remove('on');
      boostBtn.removeAttribute('aria-pressed');
    }
  }
  window.addEventListener('blur', clearAllInput);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearAllInput();
  });

  // ─── Boost button ───────────────────────────────────────────────
  // Independent sources via hold-source tracker.
  const boostHold = createHoldSource();
  const boostBtn = document.getElementById('boost-btn');
  if (boostBtn) {
    // Remove aria-pressed (hold is not a toggle); set accessible label.
    boostBtn.removeAttribute('aria-pressed');
    boostBtn.setAttribute('aria-label', 'Hold to boost');

    function syncBoostVisual() {
      boostBtn.classList.toggle('on', boostHold.active);
    }

    // Pointer events — each pointer tracked independently
    boostBtn.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') e.preventDefault();
      boostHold.addPointer(e.pointerId);
      boostBtn.setPointerCapture(e.pointerId);
      syncBoostVisual();
    });
    function releasePointer(id) {
      boostHold.removePointer(id);
      syncBoostVisual();
    }
    boostBtn.addEventListener('pointerup', (e) => releasePointer(e.pointerId));
    boostBtn.addEventListener('pointercancel', (e) => releasePointer(e.pointerId));
    boostBtn.addEventListener('lostpointercapture', (e) => releasePointer(e.pointerId));

    // Keyboard hold on focused button — Space/Enter
    boostBtn.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      boostHold.setKeyboard(true);
      syncBoostVisual();
    });
    boostBtn.addEventListener('keyup', (e) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      boostHold.setKeyboard(false);
      syncBoostVisual();
    });
    // Blur releases only the keyboard-held source, not active pointers.
    boostBtn.addEventListener('blur', () => {
      boostHold.setKeyboard(false);
      syncBoostVisual();
    });
  }

  // ─── Controls object ────────────────────────────────────────────
  const ctrl = {
    joy,
    keys,
    get gyroOn() { return gyroOn; },
    get gyroBeta() { return gyroBeta; },
    get gyroGamma() { return gyroGamma; },
    get boostOn() {
      return keys['ShiftLeft'] || keys['ShiftRight'] || boostHold.active;
    },
  };
  return ctrl;
}

export function applyControls(plane, controls, dt) {
  const { joy, keys, gyroBeta, gyroGamma, gyroOn } = controls;
  const pitchSpeed = 2.0, rollSpeed = 3.5, yawSpeed = 1.5;

  // Keyboard — rate commands (like real aircraft: stick deflection = target rate)
  if (keys['KeyW']) plane.pitchRate -= pitchSpeed;
  if (keys['KeyS']) plane.pitchRate += pitchSpeed;
  if (keys['KeyA']) plane.rollRate += rollSpeed;   // A = left bank
  if (keys['KeyD']) plane.rollRate -= rollSpeed;   // D = right bank
  if (keys['KeyQ']) plane.yaw += yawSpeed * dt;
  if (keys['KeyE']) plane.yaw -= yawSpeed * dt;
  if (keys['Space']) plane.throttle = Math.max(0, plane.throttle - 0.5 * dt);

  // Touch joystick - left stick: pitch/roll, right stick: yaw/pitch
  plane.pitchRate -= joy.l.y * pitchSpeed * 1.5;
  plane.rollRate -= joy.l.x * rollSpeed * 1.5;
  plane.yaw += joy.r.x * yawSpeed * dt;
  plane.pitchRate += joy.r.y * pitchSpeed * 1.2;

  // Gyroscope — direct rate command
  if (gyroOn) {
    plane.pitchRate += gyroBeta * pitchSpeed * 1.2;
    plane.rollRate += gyroGamma * rollSpeed * 1.2;
  }

  // Aerodynamic damping on angular RATES only.
  // Real flight: pitch rate decays (longitudinal damping),
  // roll rate decays (roll damping + dihedral).
  // Angles (pitch, roll, yaw) persist — they are NOT rates.
  plane.pitchRate *= Math.pow(0.995, dt * 60);
  plane.rollRate *= Math.pow(0.993, dt * 60);

  // Clamp pitch to prevent gimbal weirdness; roll is unbounded (barrel rolls)
  plane.pitch = Math.max(-1.5, Math.min(1.5, plane.pitch));
}

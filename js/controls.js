// Touch joystick, gyro, keyboard, and mouse controls
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
    gyroBeta = Math.max(-30, Math.min(30, (e.beta || 0) - 45)) / 30;
    gyroGamma = Math.max(-30, Math.min(30, e.gamma || 0)) / 30;
  });

  // Keyboard
  const keys = {};
  const handledKeys = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'Space']);
  window.addEventListener('keydown', (e) => {
    if (!handledKeys.has(e.code)) return;
    keys[e.code] = true;
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  // Return a mutable controls object so gyro values stay in sync
  const ctrl = { joy, keys, get gyroOn() { return gyroOn; }, get gyroBeta() { return gyroBeta; }, get gyroGamma() { return gyroGamma; } };
  return ctrl;
}

export function applyControls(plane, controls, dt) {
  const { joy, keys, gyroBeta, gyroGamma, gyroOn } = controls;
  const pitchSpeed = 1.5, rollSpeed = 2.0, yawSpeed = 1.0;

  // Keyboard
  if (keys['KeyW']) plane.pitch -= pitchSpeed * dt;
  if (keys['KeyS']) plane.pitch += pitchSpeed * dt;
  if (keys['KeyA']) plane.roll -= rollSpeed * dt;
  if (keys['KeyD']) plane.roll += rollSpeed * dt;
  if (keys['KeyQ']) plane.yaw += yawSpeed * dt;
  if (keys['KeyE']) plane.yaw -= yawSpeed * dt;
  if (keys['ShiftLeft'] || keys['ShiftRight']) plane.throttle = Math.min(1, plane.throttle + 0.5 * dt);
  if (keys['Space']) plane.throttle = Math.max(0, plane.throttle - 0.5 * dt);

  // Touch joystick - left stick: pitch/roll, right stick: yaw/pitch
  plane.pitch -= joy.l.y * pitchSpeed * 1.5 * dt;
  plane.roll -= joy.l.x * rollSpeed * 1.5 * dt;
  plane.yaw += joy.r.x * yawSpeed * 1.5 * dt;
  plane.pitch += joy.r.y * pitchSpeed * 1.2 * dt;

  // Gyroscope
  if (gyroOn) {
    plane.pitch += (gyroBeta * 0.6 - plane.pitch * 0.3) * dt;
    plane.roll += (gyroGamma * 0.8 - plane.roll * 0.3) * dt;
  }

  // Auto-stabilize (gentle return to level)
  plane.pitch *= Math.pow(0.97, dt * 60);
  plane.roll *= Math.pow(0.96, dt * 60);
  plane.yaw *= Math.pow(0.99, dt * 60);

  // Clamp
  plane.pitch = Math.max(-1.2, Math.min(1.2, plane.pitch));
  plane.roll = Math.max(-1.0, Math.min(1.0, plane.roll));
}

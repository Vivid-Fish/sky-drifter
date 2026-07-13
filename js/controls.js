// Touch joystick and gyro controls
export function setupControls(plane) {
  const joy = { l: { x: 0, y: 0, active: false }, r: { x: 0, y: 0, active: false } };
  
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
  }
  initStick('stick-left', 'l');
  initStick('stick-right', 'r');
  
  // Throttle bar
  const thrFill = document.getElementById('throttle-fill');
  const thrBar = document.getElementById('throttle-bar');
  thrBar.addEventListener('touchstart', (e) => { e.preventDefault(); handleThrottle(e.touches[0]); }, { passive: false });
  thrBar.addEventListener('touchmove', (e) => { e.preventDefault(); handleThrottle(e.touches[0]); }, { passive: false });
  function handleThrottle(t) {
    const rect = thrBar.getBoundingClientRect();
    let p = 1 - (t.clientY - rect.top) / rect.height;
    p = Math.max(0, Math.min(1, p));
    plane.throttle = p;
    thrFill.style.height = p * 100 + '%';
  }
  
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
    } else {
      gyroOn = false;
      gyroBtn.classList.remove('on');
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
  window.addEventListener('keydown', (e) => { keys[e.code] = true; e.preventDefault(); });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  
  return { joy, keys, gyroBeta, gyroGamma, gyroOn };
}

export function applyControls(plane, controls, dt) {
  const { joy, keys, gyroBeta, gyroGamma, gyroOn } = controls;
  const pitchSpeed = 1.5, rollSpeed = 2.0, yawSpeed = 1.0;
  
  // Keyboard
  if (keys['KeyW']) plane.pitch -= pitchSpeed * dt;
  if (keys['KeyS']) plane.pitch += pitchSpeed * dt;
  if (keys['KeyA']) plane.roll -= rollSpeed * dt;  // Fixed: A = roll left
  if (keys['KeyD']) plane.roll += rollSpeed * dt;  // Fixed: D = roll right
  if (keys['KeyQ']) plane.yaw += yawSpeed * dt;
  if (keys['KeyE']) plane.yaw -= yawSpeed * dt;
  if (keys['ShiftLeft'] || keys['ShiftRight']) plane.throttle = Math.min(1, plane.throttle + 0.5 * dt);
  if (keys['Space']) plane.throttle = Math.max(0, plane.throttle - 0.5 * dt);
  
  // Touch joystick - left stick: pitch/roll, right stick: yaw/pitch
  plane.pitch -= joy.l.y * pitchSpeed * 1.5 * dt;
  plane.roll -= joy.l.x * rollSpeed * 1.5 * dt;  // Fixed: left = roll left
  plane.yaw += joy.r.x * yawSpeed * 1.5 * dt;
  plane.pitch += joy.r.y * pitchSpeed * 1.2 * dt;
  
  // Gyroscope
  if (gyroOn) {
    plane.pitch += (gyroBeta * 0.6 - plane.pitch * 0.3) * dt;
    plane.roll += (gyroGamma * 0.8 - plane.roll * 0.3) * dt;
  }
  
  // Auto-stabilize
  plane.pitch *= 0.98;
  plane.roll *= 0.97;
  plane.yaw *= 0.99;
  
  // Clamp
  plane.pitch = Math.max(-1.2, Math.min(1.2, plane.pitch));
  plane.roll = Math.max(-1.0, Math.min(1.0, plane.roll));
}

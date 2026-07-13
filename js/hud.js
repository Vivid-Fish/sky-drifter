// Enhanced HUD with score, mission progress, G-meter, stall warning
const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function createHUD() {
  const hud = document.createElement('div');
  hud.id = 'game-hud';
  hud.innerHTML = `
    <div id="score-display">Score: 0</div>
    <div id="mission-display">Mission: Find the rings</div>
    <div id="ring-counter">Rings: 0/0</div>
    <div id="g-meter">G: 0.0</div>
    <div id="stall-warning" class="hidden">STALL WARNING</div>
    <div id="altitude-warning" class="hidden">TOO LOW</div>
  `;
  document.body.appendChild(hud);

  return {
    scoreEl: document.getElementById('score-display'),
    missionEl: document.getElementById('mission-display'),
    ringEl: document.getElementById('ring-counter'),
    gEl: document.getElementById('g-meter'),
    stallEl: document.getElementById('stall-warning'),
    altWarnEl: document.getElementById('altitude-warning'),
  };
}

// ─── Boost Energy Bar ─────────────────────────────────────────────
// role=progressbar with aria-valuenow updated only on integer changes
// to avoid 60fps attribute churn.  Per-instance last-value tracking.

export function createBoostBar(id) {
  const bar = document.createElement('div');
  if (id) bar.id = id;
  bar.classList.add('boost-bar');
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');
  bar.setAttribute('aria-label', 'Boost energy');
  bar.innerHTML = '<div class="boost-fill"></div><div class="boost-label">B</div>';
  document.body.appendChild(bar);
  bar.setAttribute('aria-valuenow', '100');

  // Per-instance tracking object: root element + fill child + last value.
  const boostBar = {
    el: bar,
    fill: bar.querySelector('.boost-fill'),
    _lastValue: 100,
  };
  return boostBar;
}

export function updateBoostBar(boostBar, result) {
  if (!boostBar) return;
  const pct = result.energy / 100;
  boostBar.fill.style.transform = `scaleY(${pct})`;

  // Update accessible value only when integer changes
  const intVal = Math.round(result.energy);
  if (intVal !== boostBar._lastValue) {
    boostBar.el.setAttribute('aria-valuenow', String(intVal));
    boostBar._lastValue = intVal;
  }

  // Visual state classes
  boostBar.fill.classList.toggle('empty', result.energy < 5);
  // "boosting" class only when actually boosting (active=true),
  // not when exhausted-but-held (active=false, requested=true).
  boostBar.fill.classList.toggle('boosting', result.active);
}

export function updateHUD(hud, plane, score, rings, totalRings) {
  if (!hud) return;

  // Score
  hud.scoreEl.textContent = 'Score: ' + score;

  // Mission
  const collected = rings.filter(r => r.userData.collected).length;
  hud.ringEl.textContent = 'Rings: ' + collected + '/' + totalRings;

  if (collected === totalRings && totalRings > 0) {
    hud.missionEl.textContent = '✓ Mission Complete!';
  } else {
    hud.missionEl.textContent = 'Mission: Fly through ' + (totalRings - collected) + ' rings';
  }

  // G-force
  // Coordinated-turn approximation: level flight is 1 G; bank increases load.
  const gForce = 1 / Math.max(0.25, Math.cos(Math.abs(plane.roll)));
  hud.gEl.textContent = 'G: ' + Math.min(gForce, 9.9).toFixed(1);

  // Stall warning (low speed + high pitch)
  const isStalling = plane.speed < 40 && Math.abs(plane.pitch) > 0.5;
  hud.stallEl.classList.toggle('hidden', !isStalling);

  // Altitude warning
  const alt = plane.position.y;
  hud.altWarnEl.classList.toggle('hidden', alt > 20);
}

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

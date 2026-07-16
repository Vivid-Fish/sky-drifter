import * as THREE from 'three';
import SimplexNoise from './noise.js';
import { height, updateChunks } from './terrain.js';
import { setupControls, applyControls } from './controls.js';
import { initAudio, resumeAudio, updateAudio, playRingCollect, loadAudioAssets, playSound, playThunder, getAudioStatus, audioAssets } from './audio.js';
import { createHUD, updateHUD as updateGameHUD, createBoostBar, updateBoostBar } from './hud.js';
import { generateMission, checkRingCollision, updateRings } from './missions.js';
import { initWeather, setRain, updateWeather, getFogDensity, isRaining } from './weather.js';
import { update as updateBoost } from './boost.js';
import { stepPhysics, stepSpeed, computeAccelerations, getLiftCoefficient, PHYSICS } from './flight-physics.js';

// ─── Scene ───────────────────────────────────────────────────────
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 1, 8000);
let renderer = null;
let rendererError = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  document.body.insertBefore(renderer.domElement, document.body.firstChild);
} catch (e) {
  rendererError = e;
  console.error('WebGL unavailable:', e.message);
}

// ─── Sky ──────────────────────────────────────────────────────────
// Procedural sky (always present — fallback if texture fails)
const skyUniforms = { uSun: { value: new THREE.Vector3(500, 300, -800) } };
const skyMatProcedural = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: skyUniforms,
  vertexShader: 'varying vec3 vp;void main(){vp=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `
    uniform vec3 uSun;
    uniform float uDayFactor;
    varying vec3 vp;
    void main(){
      vec3 d=normalize(vp);
      float y=d.y*.5+.5;
      vec3 daySky=mix(vec3(.75,.82,.92),vec3(.35,.55,.85),smoothstep(0.0,.3,y));
      daySky=mix(daySky,vec3(.12,.18,.45),smoothstep(.3,.8,y));
      daySky=mix(daySky,vec3(.85,.88,.92),exp(-pow(y*3.,2.))*.5);
      vec3 nightSky=mix(vec3(.04,.04,.1),vec3(.02,.02,.08),smoothstep(0.0,.6,y));
      vec3 s=mix(nightSky,daySky,uDayFactor);
      vec3 su=normalize(uSun);
      float sd=max(dot(d,su),0.);
      vec3 sunColor=mix(vec3(.15,.15,.3),vec3(1,.95,.8),uDayFactor);
      s+=sunColor*pow(sd,1024.)*1.5*uDayFactor;
      s+=sunColor*pow(sd,64.)*.2*uDayFactor;
      s+=mix(vec3(.6,.6,.8),vec3(1,.85,.6),uDayFactor)*pow(sd,4.)*.15*uDayFactor;
      if(d.y<0.)s=mix(s,vec3(.2,.3,.15)*uDayFactor,smoothstep(0.0,-.15,d.y));
      gl_FragColor=vec4(s,1.);
    }`,
});
skyMatProcedural.uniforms.uDayFactor = { value: 1.0 };

const skyGeo = new THREE.SphereGeometry(3500, 32, 32);
const sky = new THREE.Mesh(skyGeo, skyMatProcedural);
scene.add(sky);

// Try loading AI-generated equirectangular skybox texture
let skyboxLoaded = false;
const skyboxLoader = new THREE.TextureLoader();
skyboxLoader.load(
  'assets/textures/skybox-equi.png',
  (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    // Equirectangular: sphere UVs map naturally (u=longitude, v=latitude)
    const skyboxMat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.BackSide,
    });
    sky.material = skyboxMat;
    skyboxLoaded = true;
    console.log('Skybox texture loaded');
  },
  undefined,
  () => { console.log('Skybox texture unavailable — using procedural sky'); }
);

// ─── Lighting ─────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0x6688aa, 0.6);
scene.add(ambientLight);
const sun = new THREE.DirectionalLight(0xffeedd, 1.8);
sun.position.set(500, 300, -800);
scene.add(sun);
const hemiLight = new THREE.HemisphereLight(0x88aacc, 0x445522, 0.4);
scene.add(hemiLight);

// ─── Water ────────────────────────────────────────────────────────
const waterMat = new THREE.MeshPhongMaterial({ color: 0x1a4a6a, transparent: true, opacity: 0.7, shininess: 100, specular: 0x4488aa });
const water = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000), waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = -5;
scene.add(water);
scene.fog = new THREE.FogExp2(0x8899bb, 0.00055);

// ─── Clouds ───────────────────────────────────────────────────────
const cloudGroup = new THREE.Group();
scene.add(cloudGroup);
const clouds = [];
const cloudGeometry = new THREE.SphereGeometry(1, 12, 8);
const cloudMaterials = [0.55, 0.63, 0.7].map(opacity => new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity, depthWrite: false }));
for (let i = 0; i < 48; i++) {
  const g = new THREE.Group();
  const n = 3 + Math.floor(Math.random() * 5);
  for (let j = 0; j < n; j++) {
    const s = 10 + Math.random() * 20;
    const p = new THREE.Mesh(cloudGeometry, cloudMaterials[Math.floor(Math.random() * cloudMaterials.length)]);
    p.position.set((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 30);
    p.scale.y = 0.4 + Math.random() * 0.2;
    p.scale.multiplyScalar(s);
    g.add(p);
  }
  g.position.set((Math.random() - 0.5) * 2000, 180 + Math.random() * 180, (Math.random() - 0.5) * 2000);
  g.userData = { sp: 2 + Math.random() * 5, dr: (Math.random() - 0.5) * 3 };
  cloudGroup.add(g);
  clouds.push(g);
}

// ─── Aircraft ─────────────────────────────────────────────────────
const aircraft = new THREE.Group();
const fuselageMat = new THREE.MeshPhongMaterial({ color: 0xe8e8e8, shininess: 60 });
const wingMat = new THREE.MeshPhongMaterial({ color: 0xcc4444, shininess: 40 });
const fg = new THREE.CylinderGeometry(0.4, 0.6, 6, 8);
fg.rotateX(Math.PI / 2);
aircraft.add(new THREE.Mesh(fg, fuselageMat));
const ng = new THREE.ConeGeometry(0.4, 2, 8);
ng.rotateX(Math.PI / 2);
const nose = new THREE.Mesh(ng, fuselageMat);
nose.position.z = -4;
aircraft.add(nose);
const wg = new THREE.BoxGeometry(12, 0.15, 2);
const wings = new THREE.Mesh(wg, wingMat);
wings.position.set(0, -0.1, 0.5);
aircraft.add(wings);
const tg = new THREE.BoxGeometry(4, 0.12, 1.5);
const tail = new THREE.Mesh(tg, wingMat);
tail.position.set(0, -0.05, 3);
aircraft.add(tail);
const vg = new THREE.BoxGeometry(0.12, 2, 1.5);
const vStab = new THREE.Mesh(vg, wingMat);
vStab.position.set(0, 0.9, 2.8);
aircraft.add(vStab);
const prop = new THREE.Group();
for (let i = 0; i < 2; i++) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.5, 0.08), new THREE.MeshPhongMaterial({ color: 0x333 }));
  b.rotation.z = Math.PI / 2 * i;
  prop.add(b);
}
prop.position.z = -5;
aircraft.add(prop);
scene.add(aircraft);

// ─── Flight State ─────────────────────────────────────────────────
const plane = {
  position: new THREE.Vector3(0, 220, 0),
  velocity: new THREE.Vector3(0, 0, -80),
  quaternion: new THREE.Quaternion(),
  // Persistent angles (do NOT decay to zero)
  pitch: 0,
  roll: 0,
  yaw: 0,
  // Angular rates (decay from aerodynamic damping)
  pitchRate: 0,
  rollRate: 0,
  throttle: 0.5,
  speed: 80,
};

// ─── Cached temp objects (avoid per-frame GC) ───────────────────
const _euler = new THREE.Euler();
const _targetQuat = new THREE.Quaternion();
const _forward = new THREE.Vector3();
const _camOffset = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

// ─── Controls ─────────────────────────────────────────────────────
const controls = setupControls(plane);

// ─── Audio (loaded on user gesture) ───────────────────────────────
let audioReady = false;
loadAudioAssets();

// Thunder sound from weather lightning
window.addEventListener('skydrifter-thunder', () => {
  if (!audioReady) return;
  playThunder();
});

// ─── Weather ──────────────────────────────────────────────────────
initWeather(scene);
let weatherToggleOn = false;
const weatherBtn = document.createElement('button');
weatherBtn.id = 'weather-btn';
weatherBtn.textContent = 'WX';
weatherBtn.type = 'button';
weatherBtn.setAttribute('aria-label', 'Toggle rain');
weatherBtn.setAttribute('aria-pressed', 'false');
weatherBtn.addEventListener('click', () => {
  weatherToggleOn = !weatherToggleOn;
  weatherBtn.classList.toggle('on', weatherToggleOn);
  weatherBtn.setAttribute('aria-pressed', String(weatherToggleOn));
  setRain(weatherToggleOn);
  if (weatherToggleOn && audioAssets?.thunder) {
    playSound(audioAssets.thunder, 0.3);
  }
});
document.body.appendChild(weatherBtn);

// ─── Accessibility ────────────────────────────────────────────────
const a11yBtn = document.createElement('button');
a11yBtn.id = 'a11y-btn';
a11yBtn.textContent = 'HC';
a11yBtn.type = 'button';
a11yBtn.setAttribute('aria-label', 'Toggle high contrast');
a11yBtn.setAttribute('aria-pressed', 'false');
a11yBtn.addEventListener('click', () => {
  document.body.classList.toggle('high-contrast');
  a11yBtn.classList.toggle('on');
  a11yBtn.setAttribute('aria-pressed', String(document.body.classList.contains('high-contrast')));
});
document.body.appendChild(a11yBtn);

// ─── Boost Bar ────────────────────────────────────────────────────
const boostBar = createBoostBar('boost-bar');

// ─── Mission Flash ────────────────────────────────────────────────
const missionFlash = document.createElement('div');
missionFlash.id = 'mission-flash';
missionFlash.innerHTML = '<h2>MISSION COMPLETE</h2>';
document.body.appendChild(missionFlash);
let missionFlashTimer = 0;

// ─── Missions ─────────────────────────────────────────────────────
let score = 0;
let missionLevel = 0;
let missionRings = [];
let missionObjects = []; // Three.js objects to remove on reset
const hud = createHUD();

function startMission() {
  // Clean old mission
  for (const obj of missionObjects) { scene.remove(obj); }
  missionObjects = [];
  missionRings = [];

  const count = 5 + missionLevel * 3;
  const rings = generateMission(plane.position, count);
  missionRings = rings;
  for (const ring of rings) {
    scene.add(ring);
    missionObjects.push(ring);
  }
  updateGameHUD(hud, plane, score, missionRings, missionRings.length);
}

// ─── Basic HUD (alt, spd, compass) ────────────────────────────────
const altEl = document.getElementById('alt');
const spdEl = document.getElementById('spd');
const cmpEl = document.getElementById('compass');
const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function updateBasicHUD() {
  altEl.textContent = 'Alt ' + Math.max(0, plane.position.y + 5).toFixed(0) + 'm';
  spdEl.textContent = 'Spd ' + Math.abs(plane.speed * 3.6).toFixed(0) + 'km/h';
  const d = Math.atan2(-plane.velocity.x, -plane.velocity.z);
  const deg = ((d * 180 / Math.PI) % 360 + 360) % 360;
  const idx = Math.round(deg / 45) % 8;
  cmpEl.textContent = dirs[idx] + ' ' + Math.round(deg) + '°';
}

// ─── Day/Night Cycle ──────────────────────────────────────────────
let dayFactor = 1.0;
let dayTime = 0.5; // begin at noon; 0..1 over a full cycle

function updateDayNight(dt) {
  // Full cycle = 120 seconds for gameplay pacing
  dayTime = (dayTime + dt / 120) % 1;
  // Smooth sine: 0=midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset
  const raw = Math.sin(dayTime * Math.PI * 2 - Math.PI / 2);
  dayFactor = Math.max(0.05, Math.min(1, (raw + 1) / 2));

  // Procedural sky has day uniform; skybox texture does not
  if (sky.material.uniforms?.uDayFactor) {
    sky.material.uniforms.uDayFactor.value = dayFactor;
  }
  sun.intensity = dayFactor * 2.0;
  ambientLight.intensity = 0.2 + dayFactor * 0.5;
  hemiLight.intensity = 0.1 + dayFactor * 0.4;

  // Fog color shifts
  const fogR = 0.02 + dayFactor * 0.52;
  const fogG = 0.02 + dayFactor * 0.56;
  const fogB = 0.06 + dayFactor * 0.66;
  scene.fog.color.setRGB(fogR, fogG, fogB);
}

// ─── Resize ───────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer?.setSize(window.innerWidth, window.innerHeight);
});

// ─── Stall Buffeting ─────────────────────────────────────────────
// Visual shake effect when aircraft stalls — mimics airflow separation
// Prior art: A2A Simulations (exaggerated buffeting for game feel),
// SimShaker (stall → vibration), ArcadeAircraftPhysics (game-feel focus).
const buffeting = { intensity: 0, targetIntensity: 0 };

function updateBuffeting(dt, isStalling) {
  // Ramp up quickly when stall begins, decay slowly when recovered
  buffeting.targetIntensity = isStalling ? 1 : 0;
  const rampUp = isStalling ? 8 : 3; // fast attack, slower release
  buffeting.intensity += (buffeting.targetIntensity - buffeting.intensity) * dt * rampUp;
  // Clamp to avoid floating point drift
  buffeting.intensity = Math.max(0, Math.min(1, buffeting.intensity));
}

function applyBuffetShake(obj, time, intensity) {
  if (intensity < 0.01) return; // skip when negligible
  // High-frequency jitter: 40Hz-ish vibration (per game feel research)
  const freq = 40;
  const scale = intensity * 0.15; // max 0.15 radians/meters shake
  obj.rotation.x += Math.sin(time * freq * Math.PI * 2) * scale * 0.3;
  obj.rotation.z += Math.cos(time * freq * 1.7 * Math.PI * 2) * scale * 0.2;
  obj.position.x += Math.sin(time * freq * 2.3 * Math.PI * 2) * scale * 0.5;
}

// ─── Game Loop ────────────────────────────────────────────────────
let go = false, t0 = performance.now(), chunkTimer = 0;
const chunks = new Map();
let gameTime = 0;
let boostResult = { active: false, energy: 100, multiplier: 1, activated: false };

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min((now - t0) / 1000, 0.05);
  t0 = now;

  if (!go) { if (renderer) renderer.render(scene, camera); return; }

  gameTime += dt;

  // ── Controls ──
  applyControls(plane, controls, dt);

  // Integrate angular rates into persistent angles
  // (rates decay from damping, angles persist until counter-input)
  plane.pitch += plane.pitchRate * dt;
  plane.roll += plane.rollRate * dt;

  // ── Boost ──
  boostResult = updateBoost(dt, controls.boostOn);

  // ── Physics ──
  const terrainHeight = height(plane.position.x, plane.position.z);
  const planeAlt = plane.position.y - terrainHeight;

  const physics = stepPhysics(plane, planeAlt, boostResult.multiplier, dt);
  plane.speed = physics.newSpeed;

  // Play boost activation sound on edge
  if (boostResult.activated && audioReady && audioAssets?.boost) {
    playSound(audioAssets.boost, 0.25);
  }

  // ── Heading from banked turns (real flight physics) ──
  // When rolled, horizontal component of lift turns the aircraft.
  // Turn rate = g * tan(roll) / speed (standard coordinated turn).
  // Q/E keys act as rudder — add yaw rate on top.
  const turnRate = 9.81 * Math.tan(plane.roll) / Math.max(plane.speed, 10);
  plane.yaw += turnRate * dt;

  _euler.set(plane.pitch, plane.yaw, plane.roll, 'YXZ');
  _targetQuat.setFromEuler(_euler);
  plane.quaternion.slerp(_targetQuat, dt * 3);

  _forward.set(0, 0, -1).applyQuaternion(plane.quaternion);
  plane.velocity.copy(_forward.multiplyScalar(plane.speed));
  plane.velocity.y += physics.verticalVelocityDelta;
  plane.position.add(_forward.multiplyScalar(plane.speed * dt));
  plane.position.y += physics.verticalVelocityDelta * dt;

  // Terrain collision — gentle push-up, not hard clamp
  const minAlt = Math.max(terrainHeight + 10, -5 + 5);
  if (plane.position.y < minAlt) {
    plane.position.y = minAlt;
    // Ground proximity: push nose up gently
    plane.pitch = Math.max(0, plane.pitch * 0.5 - 0.1);
    // Bounce: add upward velocity
    plane.velocity.y = Math.max(plane.velocity.y, 5);
  }

  // ── Store physics state for HUD/audio ──
  plane._physics = physics;

  // ── Stall buffeting ──
  updateBuffeting(dt, physics.isStalling);

  // ── Aircraft visual ──
  aircraft.position.copy(plane.position);
  aircraft.quaternion.copy(plane.quaternion);
  // Apply stall shake to aircraft mesh
  applyBuffetShake(aircraft, gameTime, buffeting.intensity);
  prop.rotation.z += plane.throttle * 30 * dt;

  // Camera follow with smooth lerp
  _camOffset.set(0, 3, 12).applyQuaternion(plane.quaternion);
  _camTarget.copy(plane.position).add(_camOffset);
  camera.position.lerp(_camTarget, dt * 4);
  // Apply stall shake to camera (amplified slightly for visibility)
  if (buffeting.intensity > 0.01) {
    const camShake = buffeting.intensity * 0.3;
    camera.position.x += Math.sin(gameTime * 35 * Math.PI * 2) * camShake;
    camera.position.y += Math.cos(gameTime * 28 * Math.PI * 2) * camShake * 0.7;
  }
  _lookTarget.set(0, 0, -30).applyQuaternion(plane.quaternion).add(plane.position);
  camera.lookAt(_lookTarget);

  // ── Terrain chunks ──
  chunkTimer += dt;
  if (chunkTimer > 0.2) { updateChunks(scene, chunks, plane.position); chunkTimer = 0; }

  // ── Clouds ──
  for (const cloud of clouds) {
    cloud.position.x += cloud.userData.sp * dt;
    cloud.position.z += cloud.userData.dr * dt;
    const dx = cloud.position.x - plane.position.x, dz = cloud.position.z - plane.position.z;
    const wrap = 1000;
    if (dx > wrap) cloud.position.x -= wrap * 2;
    if (dx < -wrap) cloud.position.x += wrap * 2;
    if (dz > wrap) cloud.position.z -= wrap * 2;
    if (dz < -wrap) cloud.position.z += wrap * 2;
  }

  // ── Sky / water follow ──
  sky.position.set(plane.position.x, 0, plane.position.z);
  water.position.x = plane.position.x;
  water.position.z = plane.position.z;
  waterMat.opacity = 0.65 + Math.sin(now * 0.001) * 0.05;

  // ── Day/Night ──
  updateDayNight(dt);

  // ── Weather ──
  updateWeather(dt, plane.position);
  scene.fog.density = getFogDensity();

  // ── Missions ──
  if (missionRings.length > 0) {
    updateRings(missionRings, gameTime);
    const points = checkRingCollision(plane, missionRings);
    if (points > 0) {
      score += points;
      if (audioReady && audioAssets?.ringChime) {
        playSound(audioAssets.ringChime, 0.2);
      } else {
        playRingCollect();
      }
    }

    const collected = missionRings.filter(r => r.userData.collected).length;
    if (collected === missionRings.length && !missionFlash.classList.contains('show')) {
      missionLevel++;
      score += 500 * missionLevel; // bonus
      missionFlash.classList.add('show');
      missionFlashTimer = 2;
      if (audioReady && audioAssets?.boost) {
        playSound(audioAssets.boost, 0.3);
      }
      setTimeout(() => { if (go) startMission(); }, 2000);
    }
    updateGameHUD(hud, plane, score, missionRings, missionRings.length);
  }

  // ── HUD ──
  updateBasicHUD();
  updateBoostBar(boostBar, boostResult);

  // ── Mission flash timer ──
  if (missionFlashTimer > 0) {
    missionFlashTimer -= dt;
    if (missionFlashTimer <= 0) {
      missionFlash.classList.remove('show');
    }
  }

  // ── Audio ──
  if (audioReady) {
    updateAudio(plane.throttle, plane.speed, plane.pitch, plane._physics?.isStalling ?? false);
  }

  if (renderer) renderer.render(scene, camera);
}

// ─── Start Button (user gesture → audio unlock) ───────────────────
document.getElementById('go-btn').addEventListener('click', () => {
  if (rendererError) {
    const splash = document.getElementById('splash');
    splash.querySelector('p').textContent = 'WebGL could not start. Enable hardware acceleration or try a current browser.';
    splash.classList.add('error');
    return;
  }
  document.getElementById('splash').classList.add('out');
  go = true;

  // Initialize audio on user gesture
  initAudio();
  resumeAudio();
  audioReady = true;

  // Start the first mission relative to takeoff, not page load.
  setTimeout(() => { if (go && missionRings.length === 0) startMission(); }, 1500);
});

// Read-only test/agent surface for validating behavior without visual guessing.
window.skyDrifterDebug = {
  getState: () => ({
    flying: go,
    score,
    throttle: plane.throttle,
    missionRings: missionRings.length,
    collectedRings: missionRings.filter(ring => ring.userData.collected).length,
    gyroEnabled: controls.gyroOn,
    raining: isRaining(),
    audio: getAudioStatus(),
    boost: { energy: Math.round(boostResult.energy), active: boostResult.active },
    physics: plane._physics ? {
      speed: Math.round(plane._physics.newSpeed),
      isStalling: plane._physics.isStalling,
      gForce: plane._physics.gForce.toFixed(1),
      cl: plane._physics.cl.toFixed(3),
      cd: plane._physics.cd.toFixed(5),
    } : null,
    buffeting: { intensity: Math.round(buffeting.intensity * 100) / 100 },
  }),
};

// ─── Start Loop ───────────────────────────────────────────────────
loop();

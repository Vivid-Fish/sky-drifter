import * as THREE from 'three';
import SimplexNoise from './noise.js';
import { height, terrainColor, updateChunks } from './terrain.js';
import { setupControls, applyControls } from './controls.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 1, 8000);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.insertBefore(renderer.domElement, document.body.firstChild);

// Sky
const skyUniforms = { uSun: { value: new THREE.Vector3(500, 300, -800) } };
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(3500, 32, 32),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: skyUniforms,
    vertexShader: 'varying vec3 vp;void main(){vp=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 uSun;varying vec3 vp;void main(){vec3 d=normalize(vp);float y=d.y*.5+.5;vec3 s=mix(vec3(.75,.82,.92),vec3(.35,.55,.85),smoothstep(0,.3,y));s=mix(s,vec3(.12,.18,.45),smoothstep(.3,.8,y));s=mix(s,vec3(.85,.88,.92),exp(-pow(y*3.,2.))*.5);vec3 su=normalize(uSun);float sd=max(dot(d,su),0.);s+=vec3(1,.95,.8)*pow(sd,256.)*3.;s+=vec3(1,.95,.8)*pow(sd,16.)*.3;s+=vec3(1,.85,.6)*pow(sd,4.)*.15;if(d.y<0.)s=mix(s,vec3(.2,.3,.15),smoothstep(0,-.15,d.y));gl_FragColor=vec4(s,1.);}'
  })
);
scene.add(sky);

// Lighting
scene.add(new THREE.AmbientLight(0x6688aa, 0.6));
const sun = new THREE.DirectionalLight(0xffeedd, 1.8);
sun.position.set(500, 300, -800);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x88aacc, 0x445522, 0.4));

// Water
const waterMat = new THREE.MeshPhongMaterial({ color: 0x1a4a6a, transparent: true, opacity: 0.7, shininess: 100, specular: 0x4488aa });
const water = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000), waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = -5;
scene.add(water);
scene.fog = new THREE.FogExp2(0x8899bb, 0.00055);

// Clouds
const cloudGroup = new THREE.Group();
scene.add(cloudGroup);
const clouds = [];
for (let i = 0; i < 60; i++) {
  const g = new THREE.Group();
  const n = 3 + Math.floor(Math.random() * 5);
  for (let j = 0; j < n; j++) {
    const s = 15 + Math.random() * 30;
    const p = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 + Math.random() * 0.2 }));
    p.position.set((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 30);
    p.scale.y = 0.4 + Math.random() * 0.2;
    g.add(p);
  }
  g.position.set((Math.random() - 0.5) * 2000, 80 + Math.random() * 120, (Math.random() - 0.5) * 2000);
  g.userData = { sp: 2 + Math.random() * 5, dr: (Math.random() - 0.5) * 3 };
  cloudGroup.add(g);
  clouds.push(g);
}

// Aircraft
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

// Flight state
const plane = {
  position: new THREE.Vector3(0, 100, 0),
  velocity: new THREE.Vector3(0, 0, -80),
  quaternion: new THREE.Quaternion(),
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttle: 0.5,
  speed: 80,
};

// Setup controls
const controls = setupControls(plane);

// HUD
const altEl = document.getElementById('alt');
const spdEl = document.getElementById('spd');
const cmpEl = document.getElementById('compass');
const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function updateHUD() {
  altEl.textContent = 'Alt ' + Math.max(0, plane.position.y + 5).toFixed(0) + 'm';
  spdEl.textContent = 'Spd ' + Math.abs(plane.speed * 3.6).toFixed(0) + 'km/h';
  const d = Math.atan2(-plane.velocity.x, -plane.velocity.z);
  const deg = ((d * 180 / Math.PI) % 360 + 360) % 360;
  const idx = Math.round(deg / 45) % 8;
  cmpEl.textContent = dirs[idx] + ' ' + Math.round(deg) + '°';
}

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Game loop
let go = false, t0 = performance.now(), chunkTimer = 0;
const chunks = new Map();

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min((now - t0) / 1000, 0.05);
  t0 = now;
  
  if (!go) { renderer.render(scene, camera); return; }
  
  // Apply controls
  applyControls(plane, controls, dt);
  
  // Physics
  const targetSpeed = 30 + plane.throttle * 150;
  plane.speed += (targetSpeed - plane.speed) * dt * 0.5;
  
  const euler = new THREE.Euler(plane.pitch, plane.yaw, plane.roll, 'YXZ');
  const targetQuat = new THREE.Quaternion().setFromEuler(euler);
  plane.quaternion.slerp(targetQuat, dt * 3);
  
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(plane.quaternion);
  plane.velocity.copy(forward.multiplyScalar(plane.speed));
  plane.velocity.y += Math.max(0, -plane.pitch * plane.speed * 0.5) * dt - 0.3 * dt;
  plane.position.add(plane.velocity.clone().multiplyScalar(dt));
  
  const terrainHeight = height(plane.position.x, plane.position.z);
  const minAlt = Math.max(terrainHeight + 10, -5 + 5);
  if (plane.position.y < minAlt) { plane.position.y = minAlt; plane.pitch = Math.max(0, plane.pitch * 0.5 - 0.1); }
  
  aircraft.position.copy(plane.position);
  aircraft.quaternion.copy(plane.quaternion);
  prop.rotation.z += plane.throttle * 30 * dt;
  
  const camOffset = new THREE.Vector3(0, 3, 12).applyQuaternion(plane.quaternion);
  camera.position.lerp(plane.position.clone().add(camOffset), dt * 4);
  camera.lookAt(plane.position.clone().add(new THREE.Vector3(0, 0, -30).applyQuaternion(plane.quaternion)));
  
  // Update chunks
  chunkTimer += dt;
  if (chunkTimer > 0.2) { updateChunks(scene, chunks, plane.position); chunkTimer = 0; }
  
  // Update clouds
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
  
  sky.position.set(plane.position.x, 0, plane.position.z);
  water.position.x = plane.position.x;
  water.position.z = plane.position.z;
  waterMat.opacity = 0.65 + Math.sin(now * 0.001) * 0.05;
  
  updateHUD();
  renderer.render(scene, camera);
}

// Start button
document.getElementById('go-btn').addEventListener('click', () => {
  document.getElementById('splash').classList.add('out');
  go = true;
});

// Start loop
loop();

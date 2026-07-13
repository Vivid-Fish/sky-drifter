import * as THREE from 'three';
import SimplexNoise from './noise.js';

const n1 = new SimplexNoise(42);
const n2 = new SimplexNoise(137);
const n3 = new SimplexNoise(256);

export function height(x, z) {
  let h = n1.fbm(x * 0.003, z * 0.003, 5) * 200;
  const r = 1 - Math.abs(n3.n2d(x * 0.0024, z * 0.0024));
  h += r * r * 100;
  const d = Math.sqrt(x * x + z * z), fl = Math.min(d / 120, 1);
  return h * fl;
}

export function terrainColor(h) {
  if (h < -3) return new THREE.Color(0.76, 0.72, 0.55);
  if (h < 12) return new THREE.Color(0.18, 0.35, 0.12);
  if (h < 55) return new THREE.Color(0.1, 0.26, 0.07);
  if (h < 95) return new THREE.Color(0.33, 0.31, 0.28);
  if (h < 135) { const s = Math.min((h - 95) / 40, 1); return new THREE.Color(0.33 + s * 0.6, 0.31 + s * 0.62, 0.28 + s * 0.65); }
  return new THREE.Color(0.92, 0.94, 0.97);
}

// Load alpine terrain texture (optional enhancement)
let terrainTexture = null;
const textureLoader = new THREE.TextureLoader();
textureLoader.load(
  'assets/textures/alpine-terrain.png',
  (tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    tex.colorSpace = THREE.SRGBColorSpace;
    terrainTexture = tex;
  },
  undefined,
  () => { /* texture load failed — use procedural colors only */ }
);

export function createChunk(cx, cz) {
  const g = new THREE.PlaneGeometry(200, 200, 60, 60);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const lx = p.getX(i), lz = p.getZ(i);
    const wx = cx * 200 + lx, wz = cz * 200 + lz;
    const h = height(wx, wz);
    p.setY(i, h);
    const col = terrainColor(h);
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  if (terrainTexture) {
    mat.map = terrainTexture;
    // Three normally multiplies map color directly into the procedural vertex
    // color. Treat the generated alpine image as subtle surface detail instead,
    // preserving readable terrain lighting and elevation colors.
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D(map, vMapUv);
          vec3 alpineDetail = clamp(sampledDiffuseColor.rgb * 1.5, vec3(0.65), vec3(1.35));
          diffuseColor.rgb *= mix(vec3(1.0), alpineDetail, 0.22);
          diffuseColor.a *= sampledDiffuseColor.a;
        #endif`
      );
    };
  }
  const m = new THREE.Mesh(g, mat);
  m.position.set(cx * 200, 0, cz * 200);
  return m;
}

export function updateChunks(scene, chunks, pos) {
  const pcx = Math.round(pos.x / 200), pcz = Math.round(pos.z / 200);
  for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
    if (dx * dx + dz * dz > 26) continue;
    const k = pcx + dx + ',' + pcz + dz;
    if (!chunks.has(k)) { const ch = createChunk(pcx + dx, pcz + dz); scene.add(ch); chunks.set(k, ch); }
  }
  for (const [k, ch] of chunks) {
    const [a, b] = k.split(',').map(Number);
    if ((a - pcx) ** 2 + (b - pcz) ** 2 > 36) { scene.remove(ch); ch.geometry.dispose(); ch.material.dispose(); chunks.delete(k); }
  }
}

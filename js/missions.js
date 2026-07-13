import * as THREE from 'three';

// Ring-flying missions with scoring
export function createRing(position, radius = 15) {
  const geometry = new THREE.TorusGeometry(radius, 0.8, 8, 32);
  const material = new THREE.MeshPhongMaterial({
    color: 0xffaa00,
    emissive: 0xff6600,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.9,
  });
  const ring = new THREE.Mesh(geometry, material);
  ring.position.copy(position);
  ring.userData = { collected: false, baseOpacity: 0.9 };
  return ring;
}

export function generateMission(startPos, count = 8) {
  const rings = [];
  let pos = new THREE.Vector3(
    startPos.x + (Math.random() - 0.5) * 200,
    Math.max(startPos.y + 20 + Math.random() * 60, 50),
    startPos.z - 200 - Math.random() * 300
  );
  for (let i = 0; i < count; i++) {
    const ring = createRing(pos.clone(), 12 + Math.random() * 8);
    ring.userData.index = i;
    ring.userData.points = Math.max(50, 200 - i * 20);
    // Orient ring toward next position
    if (i < count - 1) {
      const next = new THREE.Vector3(
        pos.x + (Math.random() - 0.5) * 150,
        Math.max(pos.y + (Math.random() - 0.5) * 80, 30),
        pos.z - 100 - Math.random() * 200
      );
      const dir = next.clone().sub(pos).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
      ring.quaternion.copy(quat);
      pos = next;
    }
    rings.push(ring);
  }
  return rings;
}

export function checkRingCollision(plane, rings) {
  let collected = 0;
  for (const ring of rings) {
    if (ring.userData.collected) continue;
    const dist = plane.position.distanceTo(ring.position);
    if (dist < ring.geometry.parameters.radius + 3) {
      ring.userData.collected = true;
      ring.material.opacity = 0;
      ring.material.emissiveIntensity = 0;
      collected += ring.userData.points;
    }
  }
  return collected;
}

export function updateRings(rings, time) {
  for (const ring of rings) {
    if (!ring.userData.collected) {
      ring.rotation.z = time * 0.5;
      ring.material.emissiveIntensity = 0.2 + Math.sin(time * 2 + ring.userData.index) * 0.15;
    }
  }
}

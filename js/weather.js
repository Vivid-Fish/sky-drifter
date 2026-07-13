import * as THREE from 'three';

// Weather and atmospheric effects with random events
let rainSystem = null;
let rainGeometry = null;
let rainMaterial = null;
let rainActive = false;
let rainIntensity = 0;
let targetRainIntensity = 0;
let fogDensity = 0.00055;
let targetFogDensity = 0.00055;

// Lightning flash
let lightningFlash = null;
let lightningTimer = 0;
let lightningOpacity = 0;

// Random weather events
let nextWeatherEvent = 30 + Math.random() * 40; // seconds until first event
let weatherEventTimer = 0;
let currentEvent = null; // { type, duration, elapsed }

export function initWeather(scene) {
  // Rain particles (inactive by default)
  const count = 8000;
  rainGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 600;
    positions[i * 3 + 1] = Math.random() * 400;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 600;
    velocities[i] = 80 + Math.random() * 40;
  }
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  rainGeometry.userData = { velocities };

  rainMaterial = new THREE.PointsMaterial({
    color: 0xaaaacc,
    size: 0.8,
    transparent: true,
    opacity: 0,
    sizeAttenuation: true,
  });

  rainSystem = new THREE.Points(rainGeometry, rainMaterial);
  scene.add(rainSystem);

  // Lightning flash plane
  const flashGeo = new THREE.PlaneGeometry(4000, 4000);
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  lightningFlash = new THREE.Mesh(flashGeo, flashMat);
  lightningFlash.rotation.x = -Math.PI / 2;
  lightningFlash.position.y = 300;
  scene.add(lightningFlash);
}

export function setRain(active, intensity = 1) {
  rainActive = active;
  targetRainIntensity = active ? intensity : 0;
  targetFogDensity = active ? 0.0015 : 0.00055;
}

export function isRaining() {
  return rainActive;
}

export function updateWeather(dt, planePos) {
  // Smooth rain intensity transitions
  rainIntensity += (targetRainIntensity - rainIntensity) * dt * 2;
  rainMaterial.opacity = rainIntensity * 0.4;

  // Smooth fog transition
  fogDensity += (targetFogDensity - fogDensity) * dt * 2;

  // Schedule autonomous showers only while there is no manual or active event.
  if (!rainActive && !currentEvent) {
    weatherEventTimer += dt;
    if (weatherEventTimer >= nextWeatherEvent) {
      weatherEventTimer = 0;
      nextWeatherEvent = 25 + Math.random() * 40;
      const duration = 8 + Math.random() * 15;
      setRain(true, 0.3 + Math.random() * 0.5);
      currentEvent = { type: 'rain', duration, elapsed: 0 };
    }
  }

  if (!rainActive || rainIntensity < 0.01) {
    // Still update lightning flash fade
    if (lightningOpacity > 0) {
      lightningOpacity = Math.max(0, lightningOpacity - dt * 8);
      lightningFlash.material.opacity = lightningOpacity;
      lightningFlash.position.set(planePos.x, 300, planePos.z);
    }
    return;
  }

  rainSystem.position.x = planePos.x;
  rainSystem.position.z = planePos.z;

  const positions = rainGeometry.attributes.position.array;
  const velocities = rainGeometry.userData.velocities;
  // Adjust rain speed by intensity
  const speedMult = 0.5 + rainIntensity * 1.5;
  for (let i = 0; i < velocities.length; i++) {
    positions[i * 3 + 1] -= velocities[i] * dt * speedMult;
    if (positions[i * 3 + 1] < -10) {
      positions[i * 3 + 1] = 400;
      positions[i * 3] = (Math.random() - 0.5) * 600;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 600;
    }
  }
  rainGeometry.attributes.position.needsUpdate = true;

  // Lightning during heavy rain
  if (rainIntensity > 0.5) {
    lightningTimer -= dt;
    if (lightningTimer <= 0 && Math.random() < dt * 0.15) {
      lightningOpacity = 0.3 + Math.random() * 0.4;
      lightningTimer = 2 + Math.random() * 5;
      // Dispatch thunder sound event
      window.dispatchEvent(new CustomEvent('skydrifter-thunder'));
    }
  }

  if (lightningOpacity > 0) {
    lightningOpacity = Math.max(0, lightningOpacity - dt * 6);
    lightningFlash.material.opacity = lightningOpacity;
    lightningFlash.position.set(planePos.x, 300, planePos.z);
  }

  // Handle active weather events
  if (currentEvent) {
    currentEvent.elapsed += dt;
    if (currentEvent.elapsed >= currentEvent.duration) {
      // End the event
      if (currentEvent.type === 'rain') {
        setRain(false);
      }
      currentEvent = null;
    }
  }
}

export function getFogDensity() {
  return fogDensity;
}

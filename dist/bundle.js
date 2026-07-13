(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // js/main.js
  var THREE2 = __toESM(__require("three"));

  // js/noise.js
  var SimplexNoise = class {
    constructor(seed = 42) {
      this.g = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
      this.p = Array.from({ length: 256 }, (_, i) => i);
      let s = seed | 0;
      for (let i = 255; i > 0; i--) {
        s = s * 16807 % 2147483647;
        if (s < 0) s += 2147483646;
        const j = s % (i + 1);
        [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
      }
      this.pm = new Uint8Array(512);
      for (let i = 0; i < 512; i++) this.pm[i] = this.p[i & 255];
    }
    n2d(x, y) {
      const F = 0.5 * (Math.sqrt(3) - 1), G = (3 - Math.sqrt(3)) / 6;
      const s = (x + y) * F, i = Math.floor(x + s), j = Math.floor(y + s), t = (i + j) * G;
      const x0 = x - (i - t), y0 = y - (j - t);
      const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
      const x1 = x0 - i1 + G, y1 = y0 - j1 + G, x2 = x0 - 1 + 2 * G, y2 = y0 - 1 + 2 * G;
      const ii = i & 255, jj = j & 255;
      const gi0 = this.pm[ii + this.pm[jj]] % 12, gi1 = this.pm[ii + i1 + this.pm[jj + j1]] % 12, gi2 = this.pm[ii + 1 + this.pm[jj + 1]] % 12;
      let n0 = 0, n12 = 0, n22;
      let q = 0.5 - x0 * x0 - y0 * y0;
      q = q < 0 ? 0 : (q *= q, q * q) * (this.g[gi0][0] * x0 + this.g[gi0][1] * y0);
      n0 = q;
      q = 0.5 - x1 * x1 - y1 * y1;
      q = q < 0 ? 0 : (q *= q, q * q) * (this.g[gi1][0] * x1 + this.g[gi1][1] * y1);
      n12 = q;
      q = 0.5 - x2 * x2 - y2 * y2;
      q = q < 0 ? 0 : (q *= q, q * q) * (this.g[gi2][0] * x2 + this.g[gi2][1] * y2);
      n22 = q;
      return 70 * (n0 + n12 + n22);
    }
    fbm(x, y, oct = 4) {
      let v = 0, a = 1, f = 1, m = 0;
      for (let i = 0; i < oct; i++) {
        v += this.n2d(x * f, y * f) * a;
        m += a;
        a *= 0.5;
        f *= 2;
      }
      return v / m;
    }
  };
  var noise_default = SimplexNoise;

  // js/terrain.js
  var n1 = new noise_default(42);
  var n2 = new noise_default(137);
  var n3 = new noise_default(256);
  function height(x, z) {
    let h = n1.fbm(x * 3e-3, z * 3e-3, 5) * 200;
    const r = 1 - Math.abs(n3.n2d(x * 24e-4, z * 24e-4));
    h += r * r * 100;
    const d = Math.sqrt(x * x + z * z), fl = Math.min(d / 120, 1);
    return h * fl;
  }
  function terrainColor(h) {
    if (h < -3) return new THREE.Color(0.76, 0.72, 0.55);
    if (h < 12) return new THREE.Color(0.18, 0.35, 0.12);
    if (h < 55) return new THREE.Color(0.1, 0.26, 0.07);
    if (h < 95) return new THREE.Color(0.33, 0.31, 0.28);
    if (h < 135) {
      const s = Math.min((h - 95) / 40, 1);
      return new THREE.Color(0.33 + s * 0.6, 0.31 + s * 0.62, 0.28 + s * 0.65);
    }
    return new THREE.Color(0.92, 0.94, 0.97);
  }
  function createChunk(cx, cz) {
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
      c[i * 3] = col.r;
      c[i * 3 + 1] = col.g;
      c[i * 3 + 2] = col.b;
    }
    g.computeVertexNormals();
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.position.set(cx * 200, 0, cz * 200);
    return m;
  }
  function updateChunks(scene2, chunks2, pos) {
    const pcx = Math.round(pos.x / 200), pcz = Math.round(pos.z / 200);
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
      if (dx * dx + dz * dz > 26) continue;
      const k = pcx + dx + "," + pcz + dz;
      if (!chunks2.has(k)) {
        const ch = createChunk(pcx + dx, pcz + dz);
        scene2.add(ch);
        chunks2.set(k, ch);
      }
    }
    for (const [k, ch] of chunks2) {
      const [a, b] = k.split(",").map(Number);
      if ((a - pcx) ** 2 + (b - pcz) ** 2 > 36) {
        scene2.remove(ch);
        ch.geometry.dispose();
        ch.material.dispose();
        chunks2.delete(k);
      }
    }
  }

  // js/controls.js
  function setupControls(plane2) {
    const joy = { l: { x: 0, y: 0, active: false }, r: { x: 0, y: 0, active: false } };
    function initStick(id, side) {
      const zone = document.getElementById(id);
      const thumb = document.getElementById(id === "stick-left" ? "thumb-l" : "thumb-r");
      const cx = 70, cy = 70, r = 40;
      function start(t) {
        joy[side].active = true;
        thumb.classList.add("active");
        move(t);
      }
      function move(t) {
        const rect = zone.getBoundingClientRect();
        const tx = (t.touches ? t.touches[0].clientX : t.clientX) - rect.left;
        const ty = (t.touches ? t.touches[0].clientY : t.clientY) - rect.top;
        let dx = tx - cx, dy = ty - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r) {
          dx = dx / d * r;
          dy = dy / d * r;
        }
        thumb.style.transform = `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
        joy[side].x = dx / r;
        joy[side].y = dy / r;
      }
      function end() {
        joy[side].active = false;
        joy[side].x = 0;
        joy[side].y = 0;
        thumb.classList.remove("active");
        thumb.style.transform = "translate(-50%,-50%)";
      }
      thumb.addEventListener("touchstart", (e) => {
        e.preventDefault();
        start(e);
      }, { passive: false });
      thumb.addEventListener("touchmove", (e) => {
        e.preventDefault();
        move(e);
      }, { passive: false });
      thumb.addEventListener("touchend", (e) => {
        e.preventDefault();
        end();
      }, { passive: false });
    }
    initStick("stick-left", "l");
    initStick("stick-right", "r");
    const thrFill = document.getElementById("throttle-fill");
    const thrBar = document.getElementById("throttle-bar");
    thrBar.addEventListener("touchstart", (e) => {
      e.preventDefault();
      handleThrottle(e.touches[0]);
    }, { passive: false });
    thrBar.addEventListener("touchmove", (e) => {
      e.preventDefault();
      handleThrottle(e.touches[0]);
    }, { passive: false });
    function handleThrottle(t) {
      const rect = thrBar.getBoundingClientRect();
      let p = 1 - (t.clientY - rect.top) / rect.height;
      p = Math.max(0, Math.min(1, p));
      plane2.throttle = p;
      thrFill.style.height = p * 100 + "%";
    }
    let gyroOn = false;
    const gyroBtn = document.getElementById("gyro-btn");
    gyroBtn.addEventListener("click", async () => {
      if (!gyroOn) {
        if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
          try {
            const r = await DeviceOrientationEvent.requestPermission();
            if (r !== "granted") return;
          } catch (e) {
            return;
          }
        }
        gyroOn = true;
        gyroBtn.classList.add("on");
      } else {
        gyroOn = false;
        gyroBtn.classList.remove("on");
      }
    });
    let gyroBeta = 0, gyroGamma = 0;
    window.addEventListener("deviceorientation", (e) => {
      if (!gyroOn) return;
      gyroBeta = Math.max(-30, Math.min(30, (e.beta || 0) - 45)) / 30;
      gyroGamma = Math.max(-30, Math.min(30, e.gamma || 0)) / 30;
    });
    const keys = {};
    window.addEventListener("keydown", (e) => {
      keys[e.code] = true;
      e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      keys[e.code] = false;
    });
    return { joy, keys, gyroBeta, gyroGamma, gyroOn };
  }
  function applyControls(plane2, controls2, dt) {
    const { joy, keys, gyroBeta, gyroGamma, gyroOn } = controls2;
    const pitchSpeed = 1.5, rollSpeed = 2, yawSpeed = 1;
    if (keys["KeyW"]) plane2.pitch -= pitchSpeed * dt;
    if (keys["KeyS"]) plane2.pitch += pitchSpeed * dt;
    if (keys["KeyA"]) plane2.roll -= rollSpeed * dt;
    if (keys["KeyD"]) plane2.roll += rollSpeed * dt;
    if (keys["KeyQ"]) plane2.yaw += yawSpeed * dt;
    if (keys["KeyE"]) plane2.yaw -= yawSpeed * dt;
    if (keys["ShiftLeft"] || keys["ShiftRight"]) plane2.throttle = Math.min(1, plane2.throttle + 0.5 * dt);
    if (keys["Space"]) plane2.throttle = Math.max(0, plane2.throttle - 0.5 * dt);
    plane2.pitch -= joy.l.y * pitchSpeed * 1.5 * dt;
    plane2.roll -= joy.l.x * rollSpeed * 1.5 * dt;
    plane2.yaw += joy.r.x * yawSpeed * 1.5 * dt;
    plane2.pitch += joy.r.y * pitchSpeed * 1.2 * dt;
    if (gyroOn) {
      plane2.pitch += (gyroBeta * 0.6 - plane2.pitch * 0.3) * dt;
      plane2.roll += (gyroGamma * 0.8 - plane2.roll * 0.3) * dt;
    }
    plane2.pitch *= 0.98;
    plane2.roll *= 0.97;
    plane2.yaw *= 0.99;
    plane2.pitch = Math.max(-1.2, Math.min(1.2, plane2.pitch));
    plane2.roll = Math.max(-1, Math.min(1, plane2.roll));
  }

  // js/main.js
  var scene = new THREE2.Scene();
  var camera = new THREE2.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 1, 8e3);
  var renderer = new THREE2.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE2.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  document.body.insertBefore(renderer.domElement, document.body.firstChild);
  var skyUniforms = { uSun: { value: new THREE2.Vector3(500, 300, -800) } };
  var sky = new THREE2.Mesh(
    new THREE2.SphereGeometry(3500, 32, 32),
    new THREE2.ShaderMaterial({
      side: THREE2.BackSide,
      uniforms: skyUniforms,
      vertexShader: "varying vec3 vp;void main(){vp=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: "uniform vec3 uSun;varying vec3 vp;void main(){vec3 d=normalize(vp);float y=d.y*.5+.5;vec3 s=mix(vec3(.75,.82,.92),vec3(.35,.55,.85),smoothstep(0,.3,y));s=mix(s,vec3(.12,.18,.45),smoothstep(.3,.8,y));s=mix(s,vec3(.85,.88,.92),exp(-pow(y*3.,2.))*.5);vec3 su=normalize(uSun);float sd=max(dot(d,su),0.);s+=vec3(1,.95,.8)*pow(sd,256.)*3.;s+=vec3(1,.95,.8)*pow(sd,16.)*.3;s+=vec3(1,.85,.6)*pow(sd,4.)*.15;if(d.y<0.)s=mix(s,vec3(.2,.3,.15),smoothstep(0,-.15,d.y));gl_FragColor=vec4(s,1.);}"
    })
  );
  scene.add(sky);
  scene.add(new THREE2.AmbientLight(6719658, 0.6));
  var sun = new THREE2.DirectionalLight(16772829, 1.8);
  sun.position.set(500, 300, -800);
  scene.add(sun);
  scene.add(new THREE2.HemisphereLight(8956620, 4478242, 0.4));
  var waterMat = new THREE2.MeshPhongMaterial({ color: 1722986, transparent: true, opacity: 0.7, shininess: 100, specular: 4491434 });
  var water = new THREE2.Mesh(new THREE2.PlaneGeometry(1e4, 1e4), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -5;
  scene.add(water);
  scene.fog = new THREE2.FogExp2(8952251, 55e-5);
  var cloudGroup = new THREE2.Group();
  scene.add(cloudGroup);
  var clouds = [];
  for (let i = 0; i < 60; i++) {
    const g = new THREE2.Group();
    const n = 3 + Math.floor(Math.random() * 5);
    for (let j = 0; j < n; j++) {
      const s = 15 + Math.random() * 30;
      const p = new THREE2.Mesh(new THREE2.SphereGeometry(s, 8, 6), new THREE2.MeshLambertMaterial({ color: 16777215, transparent: true, opacity: 0.75 + Math.random() * 0.2 }));
      p.position.set((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 30);
      p.scale.y = 0.4 + Math.random() * 0.2;
      g.add(p);
    }
    g.position.set((Math.random() - 0.5) * 2e3, 80 + Math.random() * 120, (Math.random() - 0.5) * 2e3);
    g.userData = { sp: 2 + Math.random() * 5, dr: (Math.random() - 0.5) * 3 };
    cloudGroup.add(g);
    clouds.push(g);
  }
  var aircraft = new THREE2.Group();
  var fuselageMat = new THREE2.MeshPhongMaterial({ color: 15263976, shininess: 60 });
  var wingMat = new THREE2.MeshPhongMaterial({ color: 13386820, shininess: 40 });
  var fg = new THREE2.CylinderGeometry(0.4, 0.6, 6, 8);
  fg.rotateX(Math.PI / 2);
  aircraft.add(new THREE2.Mesh(fg, fuselageMat));
  var ng = new THREE2.ConeGeometry(0.4, 2, 8);
  ng.rotateX(Math.PI / 2);
  var nose = new THREE2.Mesh(ng, fuselageMat);
  nose.position.z = -4;
  aircraft.add(nose);
  var wg = new THREE2.BoxGeometry(12, 0.15, 2);
  var wings = new THREE2.Mesh(wg, wingMat);
  wings.position.set(0, -0.1, 0.5);
  aircraft.add(wings);
  var tg = new THREE2.BoxGeometry(4, 0.12, 1.5);
  var tail = new THREE2.Mesh(tg, wingMat);
  tail.position.set(0, -0.05, 3);
  aircraft.add(tail);
  var vg = new THREE2.BoxGeometry(0.12, 2, 1.5);
  var vStab = new THREE2.Mesh(vg, wingMat);
  vStab.position.set(0, 0.9, 2.8);
  aircraft.add(vStab);
  var prop = new THREE2.Group();
  for (let i = 0; i < 2; i++) {
    const b = new THREE2.Mesh(new THREE2.BoxGeometry(0.15, 2.5, 0.08), new THREE2.MeshPhongMaterial({ color: 819 }));
    b.rotation.z = Math.PI / 2 * i;
    prop.add(b);
  }
  prop.position.z = -5;
  aircraft.add(prop);
  scene.add(aircraft);
  var plane = {
    position: new THREE2.Vector3(0, 100, 0),
    velocity: new THREE2.Vector3(0, 0, -80),
    quaternion: new THREE2.Quaternion(),
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttle: 0.5,
    speed: 80
  };
  var controls = setupControls(plane);
  var altEl = document.getElementById("alt");
  var spdEl = document.getElementById("spd");
  var cmpEl = document.getElementById("compass");
  var dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  function updateHUD() {
    altEl.textContent = "Alt " + Math.max(0, plane.position.y + 5).toFixed(0) + "m";
    spdEl.textContent = "Spd " + Math.abs(plane.speed * 3.6).toFixed(0) + "km/h";
    const d = Math.atan2(-plane.velocity.x, -plane.velocity.z);
    const deg = (d * 180 / Math.PI % 360 + 360) % 360;
    const idx = Math.round(deg / 45) % 8;
    cmpEl.textContent = dirs[idx] + " " + Math.round(deg) + "\xB0";
  }
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  var go = false;
  var t0 = performance.now();
  var chunkTimer = 0;
  var chunks = /* @__PURE__ */ new Map();
  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min((now - t0) / 1e3, 0.05);
    t0 = now;
    if (!go) {
      renderer.render(scene, camera);
      return;
    }
    applyControls(plane, controls, dt);
    const targetSpeed = 30 + plane.throttle * 150;
    plane.speed += (targetSpeed - plane.speed) * dt * 0.5;
    const euler = new THREE2.Euler(plane.pitch, plane.yaw, plane.roll, "YXZ");
    const targetQuat = new THREE2.Quaternion().setFromEuler(euler);
    plane.quaternion.slerp(targetQuat, dt * 3);
    const forward = new THREE2.Vector3(0, 0, -1).applyQuaternion(plane.quaternion);
    plane.velocity.copy(forward.multiplyScalar(plane.speed));
    plane.velocity.y += Math.max(0, -plane.pitch * plane.speed * 0.5) * dt - 0.3 * dt;
    plane.position.add(plane.velocity.clone().multiplyScalar(dt));
    const terrainHeight = height(plane.position.x, plane.position.z);
    const minAlt = Math.max(terrainHeight + 10, -5 + 5);
    if (plane.position.y < minAlt) {
      plane.position.y = minAlt;
      plane.pitch = Math.max(0, plane.pitch * 0.5 - 0.1);
    }
    aircraft.position.copy(plane.position);
    aircraft.quaternion.copy(plane.quaternion);
    prop.rotation.z += plane.throttle * 30 * dt;
    const camOffset = new THREE2.Vector3(0, 3, 12).applyQuaternion(plane.quaternion);
    camera.position.lerp(plane.position.clone().add(camOffset), dt * 4);
    camera.lookAt(plane.position.clone().add(new THREE2.Vector3(0, 0, -30).applyQuaternion(plane.quaternion)));
    chunkTimer += dt;
    if (chunkTimer > 0.2) {
      updateChunks(scene, chunks, plane.position);
      chunkTimer = 0;
    }
    for (const cloud of clouds) {
      cloud.position.x += cloud.userData.sp * dt;
      cloud.position.z += cloud.userData.dr * dt;
      const dx = cloud.position.x - plane.position.x, dz = cloud.position.z - plane.position.z;
      const wrap = 1e3;
      if (dx > wrap) cloud.position.x -= wrap * 2;
      if (dx < -wrap) cloud.position.x += wrap * 2;
      if (dz > wrap) cloud.position.z -= wrap * 2;
      if (dz < -wrap) cloud.position.z += wrap * 2;
    }
    sky.position.set(plane.position.x, 0, plane.position.z);
    water.position.x = plane.position.x;
    water.position.z = plane.position.z;
    waterMat.opacity = 0.65 + Math.sin(now * 1e-3) * 0.05;
    updateHUD();
    renderer.render(scene, camera);
  }
  document.getElementById("go-btn").addEventListener("click", () => {
    document.getElementById("splash").classList.add("out");
    go = true;
  });
  loop();
})();

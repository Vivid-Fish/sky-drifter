// Audio system — loads real assets with procedural fallback
let audioCtx = null;
let engineGain = null;
let windGain = null;
let engineOsc = null;
let windNode = null;
let themeSource = null;
let stallGain = null;
let stallNode = null;
let started = false;
let lastStallState = false; // track stall transitions for one-shot sounds

export const audioAssets = {};

// Raw array buffers loaded before AudioContext exists
const rawBuffers = {};

// ─── Fetch raw audio files (safe to call anytime) ─────────────────
export async function loadAudioAssets() {
  const paths = [
    { key: 'ringChime', path: 'assets/audio/ring-chime.wav' },
    { key: 'boost', path: 'assets/audio/boost.wav' },
    { key: 'thunder', path: 'assets/audio/thunder.wav' },
    { key: 'theme', path: 'assets/audio/sky-drifter-theme.flac' },
  ];

  for (const asset of paths) {
    try {
      const resp = await fetch(asset.path);
      if (!resp.ok) continue;
      rawBuffers[asset.key] = await resp.arrayBuffer();
    } catch {
      // Asset unavailable — procedural fallback will be used
    }
  }
}

// Decode raw buffers now that AudioContext exists
function decodeRawBuffers() {
  for (const [key, buf] of Object.entries(rawBuffers)) {
    try {
      audioCtx.decodeAudioData(buf, (decoded) => {
        audioAssets[key] = decoded;
        if (key === 'theme' && started) startTheme();
      }, () => {
        // Decode failed — skip
      });
    } catch {
      // Ignore decode errors
    }
  }
}

function startTheme() {
  if (!audioCtx || !started || !audioAssets.theme || themeSource) return;
  themeSource = audioCtx.createBufferSource();
  themeSource.buffer = audioAssets.theme;
  themeSource.loop = true;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.25;
  themeSource.connect(gain);
  gain.connect(audioCtx.destination);
  themeSource.start();
}

// ─── Procedural audio (always available) ──────────────────────────
export function initAudio() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Decode any pre-loaded raw buffers
    decodeRawBuffers();

    // Engine drone (low-frequency oscillator)
    engineOsc = audioCtx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;

    const engineFilter = audioCtx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 200;
    engineFilter.Q.value = 2;

    engineGain = audioCtx.createGain();
    engineGain.gain.value = 0;

    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    engineOsc.start();

    // Wind noise (filtered white noise)
    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    windNode = audioCtx.createBufferSource();
    windNode.buffer = noiseBuffer;
    windNode.loop = true;

    const windFilter = audioCtx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 400;
    windFilter.Q.value = 0.5;

    windGain = audioCtx.createGain();
    windGain.gain.value = 0;

    windNode.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(audioCtx.destination);
    windNode.start();

    // Stall rumble (low-frequency noise when stalling)
    const stallBufferSize = 2 * audioCtx.sampleRate;
    const stallBuffer = audioCtx.createBuffer(1, stallBufferSize, audioCtx.sampleRate);
    const stallOutput = stallBuffer.getChannelData(0);
    for (let i = 0; i < stallBufferSize; i++) {
      stallOutput[i] = Math.random() * 2 - 1;
    }
    stallNode = audioCtx.createBufferSource();
    stallNode.buffer = stallBuffer;
    stallNode.loop = true;

    const stallFilter = audioCtx.createBiquadFilter();
    stallFilter.type = 'lowpass';
    stallFilter.frequency.value = 120;
    stallFilter.Q.value = 1;

    stallGain = audioCtx.createGain();
    stallGain.gain.value = 0;

    stallNode.connect(stallFilter);
    stallFilter.connect(stallGain);
    stallGain.connect(audioCtx.destination);
    stallNode.start();

    started = true;
    startTheme();
  } catch (e) {
    console.warn('Audio init failed:', e);
  }
}

export function resumeAudio() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

export function updateAudio(throttle, speed, pitch, isStalling = false) {
  if (!started || !engineGain) return;

  // Engine pitch based on throttle
  const targetFreq = 50 + throttle * 120;
  engineOsc.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.1);

  // Engine volume based on throttle
  const targetVol = Math.min(0.12, throttle * 0.15);
  engineGain.gain.setTargetAtTime(targetVol, audioCtx.currentTime, 0.1);

  // Wind based on speed
  const windVol = Math.min(0.06, (speed / 200) * 0.1);
  windGain.gain.setTargetAtTime(windVol, audioCtx.currentTime, 0.2);

  // Stall rumble — fades in when stalling, fades out when recovering
  if (stallGain) {
    const stallTarget = isStalling ? 0.08 : 0;
    stallGain.gain.setTargetAtTime(stallTarget, audioCtx.currentTime, isStalling ? 0.15 : 0.4);
  }
}

export function getAudioStatus() {
  return {
    started,
    themeDecoded: !!audioAssets.theme,
    themePlaying: !!themeSource,
  };
}

export function playRingCollect() {
  if (!audioCtx || !started) return;
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 880;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.1;
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.3);
}

export function playThunder() {
  if (!audioCtx || !started) return;
  // Try real thunder asset first
  if (audioAssets.thunder) {
    playSound(audioAssets.thunder, 0.25);
    return;
  }
  // Procedural thunder fallback
  const bufSize = audioCtx.sampleRate * 0.5;
  const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.15));
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const filt = audioCtx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 300;
  const g = audioCtx.createGain();
  g.gain.value = 0.2;
  src.connect(filt);
  filt.connect(g);
  g.connect(audioCtx.destination);
  src.start();
}

export function playSound(buffer, volume = 0.15) {
  if (!audioCtx || !buffer || !started) return;
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const gain = audioCtx.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(audioCtx.destination);
  source.start();
}

export function playAlert() {
  if (!audioCtx || !started) return;
  const osc = audioCtx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = 440;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.05;
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.5);
}

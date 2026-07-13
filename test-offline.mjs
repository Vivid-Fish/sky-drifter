import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

// ─── Config ───
const PORT = parseInt(process.env.TEST_PORT || '8177');
const TEST_DIR = process.env.TEST_DIR || '/tmp/skydrifter-test';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || 'artifacts';
mkdirSync(ARTIFACT_DIR, { recursive: true });

console.log(`Testing from ${TEST_DIR} on port ${PORT}`);

const browser = await chromium.launch({
  headless: false, // headed mode — Xvfb provides display
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-gpu-compositing',
  ],
});

// Literal artifact test: the deliverable must work when opened directly,
// without localhost or any network dependency.
console.log('\n=== Direct file test ===');
const filePage = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const fileErrors = [];
const fileNetwork = [];
filePage.on('pageerror', error => fileErrors.push(error.message));
filePage.on('console', msg => {
  if (msg.type() === 'error') fileErrors.push(msg.text());
});
filePage.on('request', request => {
  const url = request.url();
  if (!url.startsWith('file:') && !url.startsWith('data:')) fileNetwork.push(url);
});
await filePage.goto(`file://${TEST_DIR}/index.html`, { waitUntil: 'load', timeout: 30000 });
await filePage.waitForTimeout(1500);
const fileCanvas = await filePage.evaluate(() => !!document.querySelector('canvas'));
await filePage.close();
console.log(`Direct file canvas: ${fileCanvas}; errors: ${fileErrors.length}; network: ${fileNetwork.length}`);

// ─── Desktop test (1280×720) ───
console.log('\n=== Desktop Test (1280×720) ===');
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const driverWarnings = [];
const externalRequests = [];
page.on('pageerror', (err) => errors.push({ type: 'pageerror', msg: err.message }));
const onDesktopConsole = (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    const entry = { type: msg.type(), msg: msg.text() };
    // Chromium + SwiftShader emits this host-driver performance diagnostic
    // during framebuffer readback. Keep it visible, but do not classify it as
    // an application warning.
    if (msg.type() === 'warning' && /GPU stall due to ReadPixels/.test(msg.text())) {
      driverWarnings.push(entry);
    } else {
      errors.push(entry);
    }
  }
};
page.on('console', onDesktopConsole);
page.on('requestfailed', (req) => {
  errors.push({ type: 'request-failed', msg: req.url() + ' ' + req.failure() });
});
page.on('request', (req) => {
  const url = req.url();
  if (!url.startsWith('data:') && !url.startsWith(`http://localhost:${PORT}`)) {
    externalRequests.push(url);
  }
});

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

// Verify WebGL canvas — check dimensions, not context type
const canvasInfo = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  return {
    exists: !!canvas,
    width: canvas?.width || 0,
    height: canvas?.height || 0,
  };
});
console.log('Canvas:', JSON.stringify(canvasInfo));

// Click "Take Flight"
await page.click('#go-btn');
await page.waitForTimeout(3000);

// Verify HUD elements (created dynamically after game starts)
const hudChecks = await page.evaluate(() => ({
  scoreDisplay: !!document.getElementById('score-display'),
  missionDisplay: !!document.getElementById('mission-display'),
  ringCounter: !!document.getElementById('ring-counter'),
  gMeter: !!document.getElementById('g-meter'),
  stallWarning: !!document.getElementById('stall-warning'),
  altitudeWarning: !!document.getElementById('altitude-warning'),
  weatherBtn: !!document.getElementById('weather-btn'),
  a11yBtn: !!document.getElementById('a11y-btn'),
  missionFlash: !!document.getElementById('mission-flash'),
  alt: document.getElementById('alt')?.textContent,
  spd: document.getElementById('spd')?.textContent,
  compass: document.getElementById('compass')?.textContent,
}));
console.log('HUD:', JSON.stringify(hudChecks, null, 2));

// Test keyboard controls
const altBefore = hudChecks.alt;
await page.keyboard.down('KeyW');
await page.waitForTimeout(500);
await page.keyboard.up('KeyW');
await page.waitForTimeout(500);

const altAfter = await page.evaluate(() => document.getElementById('alt')?.textContent);
console.log(`Altitude: ${altBefore} → ${altAfter}`);

// Test throttle with mouse wheel
await page.mouse.wheel(0, -500);
await page.waitForTimeout(500);
const spdAfter = await page.evaluate(() => document.getElementById('spd')?.textContent);
console.log('Speed after throttle:', spdAfter);

// The mission timer starts at takeoff, even if the splash sat open beforehand.
await page.waitForTimeout(1800);
const missionChecks = await page.evaluate(() => ({
  ringCounter: document.getElementById('ring-counter')?.textContent,
  gMeter: document.getElementById('g-meter')?.textContent,
  debug: window.skyDrifterDebug?.getState(),
}));
console.log('Mission active:', JSON.stringify(missionChecks));

// Screenshot readback itself emits SwiftShader GPU-stall warnings. Runtime
// diagnostics have already been captured, so detach only for this harness step.
page.off('console', onDesktopConsole);
const desktopRuntimeErrors = [...errors];
await page.screenshot({ path: `${ARTIFACT_DIR}/test-desktop-offline.png` });
console.log('Screenshot: test-desktop-offline.png');

// ─── Mobile test (390×844) ───
console.log('\n=== Mobile Test (390×844) ===');
const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
const mobileErrors = [];
const mobileExternal = [];
mobilePage.on('pageerror', (err) => mobileErrors.push(err.message));
const onMobileConsole = (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    mobileErrors.push(msg.text());
  }
};
mobilePage.on('console', onMobileConsole);
mobilePage.on('request', (req) => {
  const url = req.url();
  if (!url.startsWith('data:') && !url.startsWith(`http://localhost:${PORT}`)) {
    mobileExternal.push(url);
  }
});

await mobilePage.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle', timeout: 30000 });
await mobilePage.waitForTimeout(3000);

const mobileChecks = await mobilePage.evaluate(() => ({
  canvas: !!document.querySelector('canvas'),
  joystickLeft: !!document.getElementById('stick-left'),
  joystickRight: !!document.getElementById('stick-right'),
  throttleBar: !!document.getElementById('throttle-bar'),
  gyroBtn: !!document.getElementById('gyro-btn'),
  a11yBtn: !!document.getElementById('a11y-btn'),
  weatherBtn: !!document.getElementById('weather-btn'),
}));
console.log('Mobile:', JSON.stringify(mobileChecks, null, 2));

await mobilePage.click('#go-btn');
await mobilePage.waitForTimeout(2000);
await mobilePage.click('#weather-btn');
const mobileBehavior = await mobilePage.evaluate(() => ({
  weatherPressed: document.getElementById('weather-btn')?.getAttribute('aria-pressed'),
  raining: window.skyDrifterDebug?.getState().raining,
}));
await mobilePage.click('#weather-btn');
console.log('Mobile behavior:', JSON.stringify(mobileBehavior));
mobilePage.off('console', onMobileConsole);
const mobileRuntimeErrors = [...mobileErrors];
await mobilePage.screenshot({ path: `${ARTIFACT_DIR}/test-mobile-offline.png` });
console.log('Screenshot: test-mobile-offline.png');

// ─── Summary ───
console.log('\n=== Summary ===');
console.log(`Desktop errors: ${desktopRuntimeErrors.length}`);
desktopRuntimeErrors.forEach(e => console.log(`  ${e.type}: ${e.msg.substring(0, 140)}`));
console.log(`Mobile errors: ${mobileRuntimeErrors.length}`);
mobileRuntimeErrors.forEach(e => console.log(`  mobile: ${e.substring(0, 140)}`));
console.log(`Known SwiftShader readback diagnostics: ${driverWarnings.length}`);
console.log(`External requests (desktop): ${externalRequests.length}`);
console.log(`External requests (mobile): ${mobileExternal.length}`);
if (externalRequests.length > 0) {
  console.log('  External URLs:', externalRequests.join(', '));
}

const canvasOk = canvasInfo.exists && canvasInfo.width > 0 && canvasInfo.height > 0;
const hudOk = hudChecks.scoreDisplay && hudChecks.missionDisplay && hudChecks.weatherBtn && hudChecks.a11yBtn;
const missionOk = /^Rings: 0\/[1-9]\d*$/.test(missionChecks.ringCounter || '') &&
  missionChecks.gMeter === 'G: 1.0' &&
  missionChecks.debug?.missionRings > 0 &&
  missionChecks.debug?.audio?.themePlaying === true;
const mobileBehaviorOk = mobileBehavior.weatherPressed === 'true' && mobileBehavior.raining === true;
const offlineOk = externalRequests.length === 0 && mobileExternal.length === 0;
const noErrors = desktopRuntimeErrors.length === 0 && mobileRuntimeErrors.length === 0;
const fileOk = fileCanvas && fileErrors.length === 0 && fileNetwork.length === 0;
const pass = fileOk && canvasOk && hudOk && missionOk && mobileBehaviorOk && offlineOk && noErrors;

console.log(`\nCanvas rendering: ${canvasOk ? '✅' : '❌'}`);
console.log(`Direct file launch: ${fileOk ? '✅' : '❌'}`);
console.log(`HUD complete: ${hudOk ? '✅' : '❌'}`);
console.log(`Mission and flight instruments active: ${missionOk ? '✅' : '❌'}`);
console.log(`Mobile weather control active: ${mobileBehaviorOk ? '✅' : '❌'}`);
console.log(`Zero external requests: ${offlineOk ? '✅' : '❌'}`);
console.log(`Zero errors/warnings: ${noErrors ? '✅' : '❌'}`);
console.log(`\nResult: ${pass ? '✅ PASS' : '❌ FAIL'}`);

await browser.close();
process.exit(pass ? 0 : 1);

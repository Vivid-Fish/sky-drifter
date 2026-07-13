#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Bundle JS modules with esbuild (keep 'three' as bare spec for importmap)
npx --yes esbuild js/main.js \
  --bundle \
  --format=esm \
  --target=es2020 \
  --outfile=dist/bundle.esm.js \
  --external:three \
  2>/dev/null

# Read CSS
CSS=$(cat css/style.css)

# Build final HTML: inline CSS, include bundle as module with importmap
cat > dist/index.html << HTMLEOF
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<title>Sky Drifter</title>
<style>${CSS}</style>
</head>
<body>
<div id="splash">
<h1>SKY DRIFTER</h1>
<p>A relaxing flight experience</p>
<div class="splash-keys">
<div><b>W/S</b> Pitch</div>
<div><b>A/D</b> Roll</div>
<div><b>Q/E</b> Yaw</div>
<div><b>&uarr;</b> Throttle &uarr;</div>
<div><b>Space</b> Throttle &darr;</div>
</div>
<button id="go-btn">Take Flight</button>
</div>
<div id="hud"><div id="alt">Alt &mdash;</div><div id="spd">Spd &mdash;</div></div>
<div id="compass">N 0&deg;</div>
<div class="joystick-zone" id="stick-left"><div class="joystick-base"></div><div class="joystick-thumb" id="thumb-l"></div><div class="joystick-label">PITCH / ROLL</div></div>
<div class="joystick-zone" id="stick-right"><div class="joystick-base"></div><div class="joystick-thumb" id="thumb-r"></div><div class="joystick-label">YAW / PITCH</div></div>
<div id="throttle-bar"><div id="throttle-fill" style="height:50%"></div><div id="throttle-label">THR</div></div>
<button id="gyro-btn">GYRO</button>
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.163.0/build/three.module.js"}}</script>
<script type="module">
$(cat dist/bundle.esm.js)
</script>
</body>
</html>
HTMLEOF

echo "Built dist/index.html ($(wc -c < dist/index.html) bytes)"

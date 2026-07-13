#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# ── Static check: every file using THREE must import it ──
for f in js/*.js; do
  if grep -q 'THREE\.' "$f" && ! grep -q 'import.*THREE' "$f"; then
    echo "ERROR: $f uses THREE but does not import it" >&2
    exit 1
  fi
done

# ── Step 1: Bundle everything (Three.js included, no externals) ──
npx esbuild js/main.js \
  --bundle \
  --format=esm \
  --target=es2020 \
  --outfile=dist/bundle.esm.js \
  2>/dev/null

# ── Step 2: Embed assets as data URLs + inline into single HTML ──
python3 - <<'PYEOF'
import base64, os, glob

# Map of source paths to (file, mime)
assets = {
    "assets/audio/ring-chime.wav": ("assets/audio/ring-chime.wav", "audio/wav"),
    "assets/audio/boost.wav": ("assets/audio/boost.wav", "audio/wav"),
    "assets/audio/thunder.wav": ("assets/audio/thunder.wav", "audio/wav"),
    "assets/audio/sky-drifter-theme.flac": ("assets/audio/sky-drifter-theme.flac", "audio/flac"),
    "assets/textures/alpine-terrain.png": ("assets/textures/alpine-terrain.png", "image/png"),
}

# Read bundle
with open("dist/bundle.esm.js", "r") as f:
    bundle = f.read()

# Replace each asset path with its data URL
for src_path, (file_path, mime) in assets.items():
    if not os.path.exists(file_path):
        print(f"Warning: {file_path} not found, skipping")
        continue
    with open(file_path, "rb") as af:
        data = af.read()
    b64 = base64.b64encode(data).decode("ascii")
    data_url = f"data:{mime};base64,{b64}"
    bundle = bundle.replace(src_path, data_url)

# Read CSS
with open("css/style.css", "r") as f:
    css = f.read()

# Generate HTML
html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="theme-color" content="#0a0f1e"/>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✈</text></svg>"/>
<title>Sky Drifter</title>
<style>{css}</style>
</head>
<body>
<div id="splash">
<h1>SKY DRIFTER</h1>
<p>A relaxing flight experience</p>
<div class="splash-keys">
<div><b>W/S</b> Pitch</div>
<div><b>A/D</b> Roll</div>
<div><b>Q/E</b> Yaw</div>
<div><b>Shift</b> Throttle ↑</div>
<div><b>Space</b> Throttle ↓</div>
</div>
<button id="go-btn" type="button">Take Flight</button>
</div>
<div id="hud"><div id="alt">Alt —</div><div id="spd">Spd —</div></div>
<div id="compass">N 0°</div>
<div class="joystick-zone" id="stick-left"><div class="joystick-base"></div><div class="joystick-thumb" id="thumb-l"></div><div class="joystick-label">PITCH / ROLL</div></div>
<div class="joystick-zone" id="stick-right"><div class="joystick-base"></div><div class="joystick-thumb" id="thumb-r"></div><div class="joystick-label">YAW / PITCH</div></div>
<div id="throttle-bar"><div id="throttle-fill"></div><div id="throttle-label">THR</div></div>
<button id="gyro-btn" type="button" aria-pressed="false">GYRO</button>
<script type="module">
{bundle}
</script>
</body>
</html>
'''

with open("dist/index.html", "w") as f:
    f.write(html)

# Count embedded data URLs
count = html.count("data:")
size = len(html.encode("utf-8"))
print(f"Built dist/index.html ({size / 1024 / 1024:.1f} MB)")
print(f"Self-contained: {count} embedded data URLs")
PYEOF

# Clean up intermediate bundle
rm -f dist/bundle.esm.js

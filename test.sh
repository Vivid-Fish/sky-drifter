#!/usr/bin/env bash
# Offline smoke test: serves only dist/index.html in isolated dir,
# runs headed Chromium under Xvfb (TCP, no unix socket, GLX disabled),
# verifies real WebGL canvas, HUD, zero external requests.
set -euo pipefail
cd "$(dirname "$0")"

# ── Prepare isolated test dir ──
TEST_DIR="/tmp/skydrifter-test-$$"
ARTIFACT_DIR="$(pwd)/artifacts"
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"
cp dist/index.html "$TEST_DIR/"
echo "Test dir: $TEST_DIR ($(ls -lh "$TEST_DIR/index.html" | awk '{print $5}'))"

# ── Find available port ──
HTTP_PORT=$(python3 -c "
import socket
s = socket.socket()
s.bind(('', 0))
print(s.getsockname()[1])
s.close()
")

# Pick a display number unlikely to collide (5000+)
DISPLAY_NUM=$((5000 + RANDOM % 100))

echo "HTTP port: $HTTP_PORT  |  Xvfb display: :$DISPLAY_NUM"

# ── Start Xvfb over TCP, GLX disabled (-extension GLX), no unix socket ──
# -extension GLX (minus) DISABLES GLX → prevents NVIDIA EGL segfault in sandbox
# Chromium uses its bundled SwiftShader for WebGL regardless
Xvfb ":$DISPLAY_NUM" \
  -screen 0 1280x720x24 \
  -extension GLX \
  -nolisten unix \
  -listen tcp \
  -ac &
XVFB_PID=$!
sleep 1

# Verify Xvfb is running; surface stderr on failure
if ! kill -0 "$XVFB_PID" 2>/dev/null; then
  echo "ERROR: Xvfb (PID $XVFB_PID) failed to start" >&2
  # Try one more time with stderr visible
  Xvfb ":$DISPLAY_NUM" \
    -screen 0 1280x720x24 \
    -extension GLX \
    -nolisten unix \
    -listen tcp \
    -ac &
  XVFB_PID=$!
  sleep 1
  if ! kill -0 "$XVFB_PID" 2>/dev/null; then
    echo "ERROR: Xvfb still failed. Check Xvfb binary and sandbox GLX libs." >&2
    exit 1
  fi
fi
echo "Xvfb PID: $XVFB_PID"

# ── Start HTTP server in test dir ──
cd "$TEST_DIR"
python3 -m http.server "$HTTP_PORT" &
SERVER_PID=$!
cd - > /dev/null
sleep 1

# ── Cleanup function (non-fatal under set -e) ──
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  kill "$XVFB_PID" 2>/dev/null || true
  wait "$XVFB_PID" 2>/dev/null || true
  rm -rf "$TEST_DIR" 2>/dev/null || true
  echo "Cleaned up Xvfb (PID $XVFB_PID), server (PID $SERVER_PID), test dir"
}
trap cleanup EXIT

# ── Run boost unit tests (deterministic, no browser) ──
echo "Running boost unit tests..."
cd "$(dirname "$0")"
node test-boost.mjs
UNIT_RESULT=$?
if [ $UNIT_RESULT -ne 0 ]; then
  echo "Unit tests failed, aborting browser tests"
  exit $UNIT_RESULT
fi

# ── Run headed tests under Xvfb TCP ──
echo "Running headed tests under Xvfb TCP (display :$DISPLAY_NUM)..."
TEST_PORT="$HTTP_PORT" TEST_DIR="$TEST_DIR" ARTIFACT_DIR="$ARTIFACT_DIR" \
  DISPLAY="localhost:$DISPLAY_NUM" \
  node "$(dirname "$0")/test-offline.mjs"
RESULT=$?

exit $RESULT

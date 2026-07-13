// Pure hold-source tracker — independent pointer IDs + keyboard flag.
// Used by controls.js for the boost button; exported for unit testing.

export function createHoldSource() {
  const pointerIds = new Set();
  let keyboard = false;

  return {
    addPointer(id) {
      pointerIds.add(id);
    },
    removePointer(id) {
      pointerIds.delete(id);
    },
    setKeyboard(on) {
      keyboard = on;
    },
    clearAll() {
      pointerIds.clear();
      keyboard = false;
    },
    get active() {
      return pointerIds.size > 0 || keyboard;
    },
  };
}

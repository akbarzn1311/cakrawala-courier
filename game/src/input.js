// Cakrawala Courier — keyboard and mouse input.
// Arrow keys (or WASD) fly the aircraft, W/S work the throttle, Q/E the
// rudder, and dragging the mouse orbits the chase camera. The module only
// reports what is held; the flight model decides what it means.

export function createInput(canvas) {
  const keys = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    // Keep the page from scrolling when the game uses the arrows or space.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseDown(e) {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }
  function onMouseMove(e) {
    if (!dragging) return;
    mouseDX += e.clientX - lastX;
    mouseDY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
  }
  function onMouseUp() {
    dragging = false;
  }
  function onBlur() {
    keys.clear();
    dragging = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  const input = {
    // Flight axes, each in [-1, 1]. Positive pitch is nose up, positive
    // roll is a left bank, positive yaw is rudder left.
    get pitch() {
      const up = keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0;
      const down = keys.has('ArrowDown') || keys.has('KeyS') ? -1 : 0;
      return up + down;
    },
    get roll() {
      const left = keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0;
      const right = keys.has('ArrowRight') || keys.has('KeyD') ? -1 : 0;
      return left + right;
    },
    get yaw() {
      const left = keys.has('KeyQ') ? 1 : 0;
      const right = keys.has('KeyE') ? -1 : 0;
      return left + right;
    },
    // Throttle: Shift (or R) opens it, Control (or F) closes it.
    get throttleDelta() {
      const up = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyR') ? 1 : 0;
      const down = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyF') ? -1 : 0;
      return up + down;
    },
    // Camera orbit, in pixels dragged since the last read; reading clears it.
    takeMouse() {
      const dx = mouseDX;
      const dy = mouseDY;
      mouseDX = 0;
      mouseDY = 0;
      return { dx, dy };
    },
    wasPressed(code) {
      return keys.has(code);
    },
    consume(code) {
      keys.delete(code);
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    },
  };
  return input;
}

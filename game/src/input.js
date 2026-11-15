// Pointer lock, key map, mouse delta accumulation. Owns nothing but browser plumbing.
export function createInput(canvas, shotMode) {
  const keys = new Set();
  const state = {
    keys, locked: false,
    firing: false, lookX: 0, lookY: 0,
    buyMenu: false, buyRequest: 0, // item index chosen this tick (1-based), 0 none
    reloadQueued: false, grenadeQueued: false,
    switchQueued: 0, // 1 primary, 2 sidearm
  };

  function onKey(e, down) {
    if (down && e.repeat) return;
    if (down) keys.add(e.code); else keys.delete(e.code);
    if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
    if (!down) return;
    if (e.code === 'KeyB') state.buyMenu = !state.buyMenu;
    if (state.buyMenu) {
      if (e.code === 'Digit1') state.buyRequest = 1;
      if (e.code === 'Digit2') state.buyRequest = 2;
      if (e.code === 'Digit3') state.buyRequest = 3;
      if (e.code === 'Digit4') state.buyRequest = 4;
      return;
    }
    if (e.code === 'KeyR') state.reloadQueued = true;
    if (e.code === 'KeyG') state.grenadeQueued = true;
    if (e.code === 'Digit1') state.switchQueued = 1;
    if (e.code === 'Digit2') state.switchQueued = 2;
    if (e.code === 'Digit4') state.grenadeQueued = true;
  }

  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => { keys.clear(); state.firing = false; });
  window.addEventListener('mousemove', (e) => {
    if (!state.locked) return;
    state.lookX += e.movementX;
    state.lookY += e.movementY;
  });
  window.addEventListener('mousedown', (e) => {
    if (state.locked && e.button === 0) state.firing = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) state.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) keys.clear();
    if (state.onLockChange) state.onLockChange(state.locked);
  });

  if (!shotMode) {
    canvas.addEventListener('click', () => {
      if (!state.locked) canvas.requestPointerLock();
    });
  }

  // Consume per-tick intents.
  state.consume = () => {
    const out = {
      fire: state.firing, lookX: state.lookX, lookY: state.lookY,
      reload: state.reloadQueued, grenade: state.grenadeQueued, switchTo: state.switchQueued,
      buy: state.buyRequest,
      fwd: keys.has('KeyW') ? 1 : 0, back: keys.has('KeyS') ? 1 : 0,
      left: keys.has('KeyA') ? 1 : 0, right: keys.has('KeyD') ? 1 : 0,
      crouch: keys.has('ControlLeft') || keys.has('KeyC'),
      plantDefuse: keys.has('KeyE'),
    };
    state.lookX = 0; state.lookY = 0;
    state.reloadQueued = false; state.grenadeQueued = false; state.switchQueued = 0; state.buyRequest = 0;
    return out;
  };
  return state;
}

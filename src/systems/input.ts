// Global mutable input state. Read every frame by the player; never reallocated.
export const input = {
  moveX: 0, // -1 left .. 1 right
  moveY: 0, // -1 back .. 1 forward
  sprint: false,
  jump: false,
  interact: false,
  lookDX: 0, // accumulated look delta (pixels), consumed by camera
  lookDY: 0,
  lastLookTime: 0,
  // touch joystick writes these directly
  touchMoveX: 0,
  touchMoveY: 0,
  touchSprint: false,
  guard: false, // fights: holding the guard (right mouse / G)
};

const keys = new Set<string>();
const pressListeners = new Map<string, Set<() => void>>();

/** One-shot key press (not held): E interact, F enter/exit vehicle, etc. */
export function onKeyPress(code: string, fn: () => void) {
  const set = pressListeners.get(code) ?? new Set();
  set.add(fn);
  pressListeners.set(code, set);
  return () => {
    set.delete(fn);
  };
}

/** Touch buttons call this to trigger the same actions as keys. */
export function pressKey(code: string) {
  pressListeners.get(code)?.forEach((fn) => fn());
}

/** True while a UI panel is open: the player ignores movement keys. */
export const inputLock = { ui: false };
const onVKey: Array<() => void> = [];

export function onCameraToggle(fn: () => void) {
  onVKey.push(fn);
  return () => {
    const i = onVKey.indexOf(fn);
    if (i >= 0) onVKey.splice(i, 1);
  };
}

function recompute() {
  const f = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
  const b = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0;
  const l = keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0;
  const r = keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0;
  input.moveY = f - b;
  input.moveX = r - l;
  input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  input.jump = keys.has('Space');
  input.interact = keys.has('KeyE');
  input.guard = keys.has('KeyG') || mouseGuard;
}
let mouseGuard = false;

export function attachInput(canvas: HTMLElement): () => void {
  const down = (e: KeyboardEvent) => {
    if (e.code === 'KeyV' && !e.repeat) onVKey.forEach((fn) => fn());
    if (!e.repeat) pressListeners.get(e.code)?.forEach((fn) => fn());
    if (e.code === 'Space') e.preventDefault();
    keys.add(e.code);
    recompute();
  };
  const up = (e: KeyboardEvent) => {
    keys.delete(e.code);
    recompute();
  };
  const blur = () => {
    keys.clear();
    recompute();
  };
  const mouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement === canvas || e.buttons & 2) {
      input.lookDX += e.movementX;
      input.lookDY += e.movementY;
      input.lastLookTime = performance.now();
    }
  };
  const click = () => {
    if (!matchMedia('(pointer: coarse)').matches && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  };
  const ctx = (e: Event) => e.preventDefault();
  // fights (systems/combat): left click punches, right button holds the guard, when the mouse is captured
  const mouseDown = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return;
    if (e.button === 0) pressListeners.get('Mouse0')?.forEach((fn) => fn());
    if (e.button === 2) {
      mouseGuard = true;
      recompute();
    }
  };
  const mouseUp = (e: MouseEvent) => {
    if (e.button === 2) {
      mouseGuard = false;
      recompute();
    }
  };

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  window.addEventListener('mousemove', mouseMove);
  canvas.addEventListener('click', click);
  canvas.addEventListener('contextmenu', ctx);
  window.addEventListener('mousedown', mouseDown);
  window.addEventListener('mouseup', mouseUp);
  return () => {
    window.removeEventListener('mousedown', mouseDown);
    window.removeEventListener('mouseup', mouseUp);
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    window.removeEventListener('mousemove', mouseMove);
    canvas.removeEventListener('click', click);
    canvas.removeEventListener('contextmenu', ctx);
  };
}

// Gamepad: polled once per frame by the player (bonus support, SPEC 8.2).
export const pad = { x: 0, y: 0, lx: 0, ly: 0, sprint: false, jump: false };
const DEAD = 0.15;
const dz = (v: number) => (Math.abs(v) < DEAD ? 0 : v);

export function pollGamepad() {
  pad.x = pad.y = pad.lx = pad.ly = 0;
  pad.sprint = pad.jump = false;
  const pads = navigator.getGamepads?.();
  if (!pads) return;
  for (const gp of pads) {
    if (!gp) continue;
    pad.x = dz(gp.axes[0] ?? 0);
    pad.y = -dz(gp.axes[1] ?? 0);
    pad.lx = dz(gp.axes[2] ?? 0);
    pad.ly = dz(gp.axes[3] ?? 0);
    pad.sprint = !!gp.buttons[10]?.pressed || !!gp.buttons[5]?.pressed;
    pad.jump = !!gp.buttons[0]?.pressed;
    return;
  }
}

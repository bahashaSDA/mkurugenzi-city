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
};

const keys = new Set<string>();
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
}

export function attachInput(canvas: HTMLElement): () => void {
  const down = (e: KeyboardEvent) => {
    if (e.code === 'KeyV' && !e.repeat) onVKey.forEach((fn) => fn());
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

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  window.addEventListener('mousemove', mouseMove);
  canvas.addEventListener('click', click);
  canvas.addEventListener('contextmenu', ctx);
  return () => {
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

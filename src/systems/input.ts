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

// ---- key bindings (Part 19.3): every action keeps its own code inside the game ('KeyF' = get in or
// out of a vehicle...); the player chooses which physical key sends it. Keys not bound to anything
// pass straight through, a key moved to another action stops sending its old one. Saved per browser.
export const ACTIONS: { code: string; label: string; group: string }[] = [
  { code: 'KeyW', label: 'Forward / throttle', group: 'Move' },
  { code: 'KeyS', label: 'Back / brake, reverse', group: 'Move' },
  { code: 'KeyA', label: 'Left / steer left', group: 'Move' },
  { code: 'KeyD', label: 'Right / steer right', group: 'Move' },
  { code: 'ShiftLeft', label: 'Sprint', group: 'Move' },
  { code: 'Space', label: 'Jump / handbrake / swim up', group: 'Move' },
  { code: 'KeyC', label: 'Dive (while swimming)', group: 'Move' },
  { code: 'KeyE', label: 'Use, talk, sit, enter', group: 'Act' },
  { code: 'KeyF', label: 'Get in / out of a vehicle, board', group: 'Act' },
  { code: 'KeyH', label: 'Horn / wave down a matatu', group: 'Act' },
  { code: 'KeyQ', label: 'Kick', group: 'Act' },
  { code: 'KeyG', label: 'Guard', group: 'Act' },
  { code: 'KeyV', label: 'Camera (first person)', group: 'View' },
  { code: 'KeyM', label: 'Map', group: 'View' },
  { code: 'KeyI', label: 'Bag', group: 'View' },
  { code: 'Comma', label: 'Radio: previous station', group: 'Radio' },
  { code: 'Period', label: 'Radio: next station', group: 'Radio' },
  { code: 'KeyR', label: 'Radio on / off', group: 'Radio' },
  { code: 'Minus', label: 'Radio volume down', group: 'Radio' },
  { code: 'Equal', label: 'Radio volume up', group: 'Radio' },
];
const BIND_KEY = 'mk.keys.v1';
/** action code -> physical key code (only the ones the player changed) */
export const bindings: Record<string, string> = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(BIND_KEY) || '{}') as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [a, k] of Object.entries(raw)) if (ACTIONS.some((x) => x.code === a) && typeof k === 'string') out[a] = k;
    return out;
  } catch {
    return {};
  }
})();
/** The physical key that sends an action. */
export const keyFor = (action: string) => bindings[action] ?? action;
/** What a physical key sends (null: nothing, it was moved to another action). */
function translate(physical: string): string | null {
  for (const a of ACTIONS) if (keyFor(a.code) === physical) return a.code;
  if (ACTIONS.some((a) => a.code === physical)) return null; // its action now lives on another key
  return physical;
}
/** Bind an action to a key; the action that had that key takes this one's old key (a swap). */
export function bindKey(action: string, physical: string) {
  const old = keyFor(action);
  const other = ACTIONS.find((a) => a.code !== action && keyFor(a.code) === physical);
  if (other) bindings[other.code] = old;
  bindings[action] = physical;
  for (const a of ACTIONS) if (bindings[a.code] === a.code) delete bindings[a.code];
  try {
    localStorage.setItem(BIND_KEY, JSON.stringify(bindings));
  } catch {
    /* storage blocked: lasts this session */
  }
  keys.clear();
}
export function resetKeys() {
  for (const k of Object.keys(bindings)) delete bindings[k];
  try {
    localStorage.removeItem(BIND_KEY);
  } catch {
    /* ignore */
  }
}
/** The controls screen is waiting for a key: the next press binds instead of playing. */
export const capture: { fn: ((code: string) => void) | null } = { fn: null };
/** Readable name of a key code ("KeyF" -> "F"). */
export function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return ({ Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', Comma: ',', Period: '.', Minus: '-', Equal: '=', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ControlLeft: 'Left Ctrl', AltLeft: 'Left Alt', Tab: 'Tab' } as Record<string, string>)[code] ?? code;
}

/** Is this (action) key held down right now? */
export const keyHeld = (code: string) => keys.has(code);

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
    if (capture.fn) {
      // the controls screen: this key is the new binding (Escape cancels)
      e.preventDefault();
      const fn = capture.fn;
      capture.fn = null;
      if (e.code !== 'Escape') fn(e.code);
      return;
    }
    const code = translate(e.code);
    if (code === 'Space' || e.code === 'Space') e.preventDefault();
    if (!code) return;
    if (code === 'KeyV' && !e.repeat) onVKey.forEach((fn) => fn());
    if (!e.repeat) pressListeners.get(code)?.forEach((fn) => fn());
    keys.add(code);
    recompute();
  };
  const up = (e: KeyboardEvent) => {
    const code = translate(e.code);
    if (code) keys.delete(code);
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

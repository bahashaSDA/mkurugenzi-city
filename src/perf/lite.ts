// "Lite": below the low tier, for phones that still can't hold the low tier's 30 fps. Turned on
// behind the splash when low measures too slow (app/Game Ready), then remembered for the device.
// Nothing is rebuilt and no shader changes: the sun's shadow map is redrawn every 4th frame instead
// of every frame (the shadow pass was ~half the draw calls), the render resolution drops and the
// town's props draw over a shorter distance.
export const LITE_KEY = 'mk.lite.v1';
export const LITE_DPR = 0.75;

function initial(): boolean {
  const q = new URLSearchParams(location.search);
  if (q.has('lite')) return true;
  if (q.has('tier') || q.has('nolite')) return false;
  try {
    return localStorage.getItem(LITE_KEY) === '1';
  } catch {
    return false;
  }
}

export const lite = { on: false };

/** Props' draw distance in lite (world/kit/KitInstances). */
export const LITE_REACH = 0.7;

export function setLite(on: boolean) {
  lite.on = on;
}

/** Off and forgotten (the player chose a quality by hand). */
export function clearLite() {
  setLite(false);
  try {
    localStorage.removeItem(LITE_KEY);
  } catch {
    /* storage blocked */
  }
}

setLite(initial());

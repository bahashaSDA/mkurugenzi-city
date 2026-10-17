import * as THREE from 'three';
import { useGame } from '../app/store';

// the post-processing chain draws the scene into a linear half-float buffer (the colour space and
// tone mapping are part of every shader): compile for that target too, not just the screen
let composerLike: THREE.WebGLRenderTarget | null = null;

/**
 * Compile the shaders of EVERYTHING in the scene, hidden or not. three's compile() only walks
 * visible objects, so far LODs, hidden door glass, spare character parts... compiled later, on first
 * sight, freezing the game for seconds. Hidden meshes are shown for the synchronous part of
 * compileAsync (which queues every program) and hidden again before anything is drawn. Lights are
 * left as they are: their count is part of every shader variant.
 */
export function compileAll(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Promise<unknown> {
  // low tier draws straight to the screen; mid/high through the post-processing buffer (world/PostFX)
  const toScreen = useGame.getState().tier === 'low';
  const shown: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (!o.visible && !(o as THREE.Light).isLight) {
      o.visible = true;
      shown.push(o);
    }
  });
  const ps: Promise<unknown>[] = [];
  const prev = gl.getRenderTarget();
  try {
    if (toScreen) gl.setRenderTarget(null);
    else {
      composerLike ??= new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
      gl.setRenderTarget(composerLike);
    }
    ps.push(gl.compileAsync(scene, camera));
  } finally {
    gl.setRenderTarget(prev);
    for (const o of shown) o.visible = false;
  }
  return Promise.all(ps).catch(() => undefined);
}

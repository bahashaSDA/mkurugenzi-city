import type * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

// One KTX2 loader (and one transcoder worker pool) per renderer, shared by kits and materials.
let loader: KTX2Loader | null = null;
let owner: THREE.WebGLRenderer | null = null;

export function getKTX2Loader(gl: THREE.WebGLRenderer): KTX2Loader {
  if (!loader || owner !== gl) {
    loader?.dispose();
    loader = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(gl);
    owner = gl;
  }
  return loader;
}

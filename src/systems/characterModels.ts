import { useThree } from '@react-three/fiber';
import { preload, suspend } from 'suspend-react';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { getKTX2Loader } from '../world/ktx2';

// Character GLBs (pedestrians, commuters, crew, attendants, the theatre crowd, fighters), cached PER
// FILE. drei's useGLTF caches a list of URLs as one key, so the same model in two systems' lists was
// downloaded and decoded again for each list (measured: every NPC model three times while loading).
// The result is shared, exactly like useGLTF's: users clone what they put in the scene.

let loader: GLTFLoader | null = null;
function load(url: string, gl: THREE.WebGLRenderer): Promise<GLTF> {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setKTX2Loader(getKTX2Loader(gl) as unknown as Parameters<GLTFLoader['setKTX2Loader']>[0]);
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader.loadAsync(url);
}

/** Suspends until every model is loaded; each file is fetched and parsed once for the whole game. */
export function useCharacterModels(urls: string[]): GLTF[] {
  const gl = useThree((s) => s.gl);
  return urls.map((u) => suspend(() => load(u, gl), ['glb', u]));
}

/** One model (kits, Abel, the conductor): the same per-file cache as the characters. */
export function useModel(url: string): GLTF {
  const gl = useThree((s) => s.gl);
  return suspend(() => load(url, gl), ['glb', url]);
}

// Every model the world mounts behind the splash. Started all at once as soon as the renderer
// exists: each component only asked for its file when React reached it, so 30 downloads ran one
// after another (a waterfall measured from 8 s to 15 s), after a 5 s gap while the terrain built.
const WORLD_MODELS = [
  'abel', 'hub_kit', 'street_kit', 'market_kit', 'kibera_kit', 'rocks_kit', 'town_kit', 'lights_kit',
  'real_buildings_kit', 'real_trees_kit', 'interior_kit', 'vehicles_kit', 'real_vehicles_kit',
  'real_vehicles2_kit', 'npc_conductor', 'npc_hustler', 'npc_auntie', 'npc_worker', 'npc_office',
  'npc_mama_mboga', 'npc_young_woman', 'npc_elder', 'npc_student', 'npc_fan_hoodie_black',
  'npc_fan_hoodie_sand', 'npc_fan_lady_black', 'npc_fan_lady_burgundy', 'npc_fan_lady_grey',
  'npc_fan_tee_burgundy', 'npc_fan_tee_botanical', 'npc_fan_suit_coffee',
].map((n) => `/models/${n}.glb`);

export function prefetchModels(gl: THREE.WebGLRenderer) {
  for (const u of WORLD_MODELS) preload(() => load(u, gl), ['glb', u]);
}

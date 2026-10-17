import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { getKTX2Loader } from '../../world/ktx2';
import { prepareCharacter } from '../characters';
import { DEFAULT_HAIR, DEFAULT_OUTFIT } from '../../game/wardrobe';

// Puts Abel's outfit and haircut on his model (game/wardrobe has the rules and the save).
// Garments, skin patches and hair come from blender/scripts/build_wardrobe.py, one small GLB each,
// loaded only when first worn or previewed. Each skinned mesh is re-bound to ABEL'S bones (by name),
// so it follows every clip, IK pose and seat exactly like his body does. It keeps its OWN inverse
// bind matrices: the optimiser folds each file's position dequantisation into them, and both files
// share the same rest pose (tools/wardrobe-bindcheck.mjs checks it). The previous look stays on
// until the new one has loaded (never a bare frame).

const SUIT = ['male_elegantsuit01', 'shoes03', 'abel_pocket_square']; // his signature outfit parts
const CAP = 'abel_cap';

type Loaded = THREE.SkinnedMesh[];
const cache = new Map<string, Promise<Loaded>>();
let loader: GLTFLoader | null = null;

function load(gl: THREE.WebGLRenderer, file: string): Promise<Loaded> {
  let p = cache.get(file);
  if (!p) {
    if (!loader) {
      loader = new GLTFLoader();
      loader.setKTX2Loader(getKTX2Loader(gl) as unknown as Parameters<GLTFLoader['setKTX2Loader']>[0]);
      loader.setMeshoptDecoder(MeshoptDecoder);
    }
    p = loader.loadAsync(`/models/wardrobe/${file}.glb`).then((g) => {
      prepareCharacter(g.scene, true);
      g.scene.updateMatrixWorld(true);
      const out: Loaded = [];
      g.scene.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh);
      });
      return out;
    });
    p.catch(() => cache.delete(file)); // a failed download can be retried later
    cache.set(file, p);
  }
  return p;
}

export class AbelWardrobe {
  private bones = new Map<string, THREE.Bone>();
  private body: THREE.SkinnedMesh | null = null;
  private suit: THREE.Object3D[] = [];
  private cap: THREE.Object3D | null = null;
  private worn = new Map<string, THREE.SkinnedMesh[]>(); // file -> meshes attached to Abel
  private want = { outfit: DEFAULT_OUTFIT, hair: DEFAULT_HAIR, cap: true };
  /** ?debug / tests: what is actually on him now */
  readonly state = { outfit: DEFAULT_OUTFIT, hair: DEFAULT_HAIR, cap: true, loading: '', meshes: 0, error: '' };

  constructor(private root: THREE.Object3D, private gl: THREE.WebGLRenderer) {
    root.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh && !this.body && /body/i.test((m.material as THREE.Material).name)) this.body = m;
      if (SUIT.some((n) => o.name.includes(n))) this.suit.push(o);
      if (o.name.includes(CAP)) this.cap = o;
    });
    this.body?.skeleton.bones.forEach((b) => this.bones.set(b.name, b));
  }

  /** Change what he wears (outfit id, haircut id, cap on/off). Safe to call every frame. */
  set(outfit: string, hair: string, cap: boolean) {
    if (outfit === this.want.outfit && hair === this.want.hair && cap === this.want.cap) return;
    this.want = { outfit, hair, cap };
    void this.apply();
  }

  private async apply() {
    const want = { ...this.want };
    const files = [want.outfit !== DEFAULT_OUTFIT ? `wd_${want.outfit}` : '', want.hair !== DEFAULT_HAIR ? `wd_hair_${want.hair}` : ''].filter(Boolean);
    this.state.loading = files.filter((f) => !this.worn.has(f)).join(',');
    try {
      const loaded = await Promise.all(files.map(async (f) => [f, await load(this.gl, f)] as const));
      if (want.outfit !== this.want.outfit || want.hair !== this.want.hair || want.cap !== this.want.cap) return; // superseded
      for (const [f, meshes] of loaded) if (!this.worn.has(f)) this.worn.set(f, meshes.map((m) => this.attach(m)).filter((m): m is THREE.SkinnedMesh => !!m));
      // swap in one go: the new look on, the old one off
      for (const [f, meshes] of this.worn) for (const m of meshes) m.visible = files.includes(f);
      for (const o of this.suit) o.visible = want.outfit === DEFAULT_OUTFIT;
      if (this.cap) this.cap.visible = want.cap;
      Object.assign(this.state, { ...want, loading: '', error: '', meshes: [...this.worn].filter(([f]) => files.includes(f)).reduce((n, [, ms]) => n + ms.length, 0) });
    } catch (e) {
      this.state.loading = '';
      this.state.error = String(e);
      console.warn('[wardrobe] could not load', files, e);
    }
  }

  /** A wardrobe mesh bound to Abel's own skeleton (null if the rig doesn't match). */
  private attach(src: THREE.SkinnedMesh): THREE.SkinnedMesh | null {
    const names = src.skeleton.bones.map((b) => b.name);
    const bones = names.map((n) => this.bones.get(n));
    if (!this.body || bones.some((b) => !b)) {
      console.warn('[wardrobe] rig mismatch for', src.name);
      return null;
    }
    const skin = /_skin$/.test(src.name);
    const m = new THREE.SkinnedMesh(src.geometry, skin ? this.body.material : src.material);
    m.name = src.name;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    // same bind space as his body: placed in Abel's scene exactly where it sat in its own file
    m.matrixAutoUpdate = false;
    m.matrix.copy(src.matrixWorld);
    this.root.add(m);
    m.updateMatrixWorld(true);
    m.bind(new THREE.Skeleton(bones as THREE.Bone[], src.skeleton.boneInverses.map((b) => b.clone())), src.bindMatrix.clone());
    return m;
  }
}

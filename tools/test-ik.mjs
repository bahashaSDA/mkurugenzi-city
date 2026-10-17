// Unit test: the two-bone IK (src/systems/player/ik.ts) puts the end bone ON a reachable target.
//   npx tsx tools/test-ik.mjs
import * as THREE from 'three';
import { solveTwoBone } from '../src/systems/player/ik.ts';
const root = new THREE.Group();
const hip = new THREE.Object3D(); hip.position.set(0.1, 0.95, 0); root.add(hip);
const knee = new THREE.Object3D(); knee.position.set(0, -0.45, 0); hip.add(knee);
const ankle = new THREE.Object3D(); ankle.position.set(0, -0.45, 0); knee.add(ankle);
// rotate root like a world placement
root.position.set(20, 0, -518); root.rotation.y = 1.2; root.updateMatrixWorld(true);
const tgtLocal = new THREE.Vector3(0.25, 0.25, 0.37);
const tgt = tgtLocal.clone().applyMatrix4(root.matrixWorld);
const pole = new THREE.Vector3(0.1, 0.5, 1).applyMatrix4(root.matrixWorld);
for (let it = 0; it < 1; it++) solveTwoBone(hip, knee, ankle, tgt, pole, 1);
const got = ankle.getWorldPosition(new THREE.Vector3());
console.log('target', tgt.toArray().map((x) => x.toFixed(3)), 'ankle', got.toArray().map((x) => x.toFixed(3)), 'err', got.distanceTo(tgt).toFixed(3));
// step-by-step: knee/ankle after solve, bone lengths
if (got.distanceTo(tgt) > 1e-3) { console.error('FAIL'); process.exit(1); } else console.log('PASS');

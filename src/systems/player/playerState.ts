import * as THREE from 'three';
import { SPAWN } from '../../config/world';

// Shared, allocation-free player position for streaming, audio zones, minimap.
export const playerPosition = new THREE.Vector3(...SPAWN);

/** Where the camera looks (horizontal unit vector) and which way Abel faces: for the radar. */
export const playerView = { lookX: 0, lookZ: -1, facing: Math.PI };

/** One-shot teleport request (entering/leaving interiors): position is the capsule centre. */
export const teleport = { pending: false, x: 0, y: 0, z: 0, facing: 0 };

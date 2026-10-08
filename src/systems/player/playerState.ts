import * as THREE from 'three';
import { SPAWN } from '../../config/world';

// Shared, allocation-free player position for streaming, audio zones, minimap.
export const playerPosition = new THREE.Vector3(...SPAWN);

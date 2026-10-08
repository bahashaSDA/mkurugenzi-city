import { useThree } from '@react-three/fiber';
import { suspend } from 'suspend-react';
import type * as THREE from 'three';
import { getKTX2Loader } from './ktx2';

/** Suspends until every KTX2 texture is loaded (cached by URL list), via the shared loader. */
export function useKTX2(urls: string[]): THREE.Texture[] {
  const gl = useThree((s) => s.gl);
  return suspend(() => Promise.all(urls.map((u) => getKTX2Loader(gl).loadAsync(u))), ['ktx2', ...urls]) as THREE.Texture[];
}

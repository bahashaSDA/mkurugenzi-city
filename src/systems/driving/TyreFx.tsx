import { useFrame, useThree } from '@react-three/fiber';
import { marksMesh, puffMesh, updateTyreFx } from './tyreMarks';

/** Tyre marks, tracks, dust and tyre smoke of every wheel that reports to tyreMarks (bounded pools). */
export function TyreFx() {
  const size = useThree((s) => s.size);
  useFrame((_, dt) => updateTyreFx(Math.min(dt, 0.1), size.height));
  return (
    <>
      <primitive object={marksMesh} />
      <primitive object={puffMesh} />
    </>
  );
}

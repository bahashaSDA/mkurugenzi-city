// GLSL twins of src/config/coast.ts (shoreX, coastProfile): keep them in sync.
export const SHORE_GLSL = /* glsl */ `
float shoreX(float z) { return 1585.0 + 28.0 * sin(z * 0.0041) + 11.0 * sin(z * 0.0113 + 1.3); }
float seabed(float d) {
  if (d <= 0.0) { float t = min(1.0, -d / 140.0); return 2.4 * t * t * (3.0 - 2.0 * t) + 0.25 * min(1.0, -d / 12.0); }
  return -min(45.0, 0.028 * d + 0.00032 * d * d);
}
`;

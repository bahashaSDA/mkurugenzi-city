import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Long-cacheable vendor chunks: three / r3f / physics change far less often than game code.
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  if (id.includes('@dimforge') || id.includes('@react-three/rapier')) return 'physics';
  if (id.includes('@react-three') || id.includes('three-stdlib')) return 'r3f';
  if (/[\\/]three[\\/]/.test(id)) return 'three';
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    rollupOptions: { output: { manualChunks } },
  },
});

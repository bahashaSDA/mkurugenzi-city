import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import latestEpisodes from './api/latest-episodes.ts';

// Serves the same /api/latest-episodes handler locally (dev + preview) as in production.
function apiRoutes(): Plugin {
  const mount = (use: (path: string, fn: (req: unknown, res: import('node:http').ServerResponse) => void) => void) =>
    use('/api/latest-episodes', async (_req, res) => {
      const r = await latestEpisodes();
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await r.text());
    });
  return {
    name: 'mk-api-routes',
    // Block bodies on purpose: a function returned from these hooks is run by Vite as a post-hook.
    configureServer(s) {
      mount(s.middlewares.use.bind(s.middlewares));
    },
    configurePreviewServer(s) {
      mount(s.middlewares.use.bind(s.middlewares));
    },
  };
}

// Long-cacheable vendor chunks: three / r3f / physics change far less often than game code.
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  if (id.includes('@dimforge') || id.includes('@react-three/rapier')) return 'physics';
  if (id.includes('@react-three') || id.includes('three-stdlib')) return 'r3f';
  if (/[\\/]three[\\/]/.test(id)) return 'three';
  return undefined;
}

export default defineConfig({
  plugins: [react(), apiRoutes()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    rollupOptions: { output: { manualChunks } },
  },
});

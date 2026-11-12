import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 genera un único index.html autocontenido (útil para compartir la preview).
export default defineConfig({
  base: './',
  plugins: [react(), ...((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SINGLE ? [viteSingleFile()] : [])],
  test: { globals: true, environment: 'node' },
});

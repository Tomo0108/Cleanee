import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Strict CSP for the packaged app only (the dev server needs inline HMR scripts). */
const csp = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<head>',
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'" />`,
    ),
});

import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), csp()],
  base: './',
  server: { port: 5288, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});

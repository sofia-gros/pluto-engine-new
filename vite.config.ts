import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

/** COOP/COEP (SharedArrayBuffer を使うために crossOriginIsolated にする)。 */
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig(({ mode, command }) => {
  // build の mode: 'parallel' | 'embed' | 'parallel-debug' | 'embed-debug'。
  // dev server (serve) は mode によらず parallel + debug (docs/05-jobs-and-builds.md §4)
  const isServe = command === 'serve';
  const isParallel = isServe || mode.startsWith('parallel');
  const isDebug = isServe || mode.endsWith('-debug');
  const outDir = isParallel ? 'dist/parallel' : 'dist/embed';
  const outExt = isDebug ? '.debug.js' : '.js';

  return {
    define: {
      __PARALLEL__: JSON.stringify(isParallel),
      __DEBUG__: JSON.stringify(isDebug),
      __VERSION__: JSON.stringify(pkg.version),
    },
    build: {
      target: 'es2022',
      outDir,
      emptyOutDir: false, // pnpm build runs multiple vite builds in parallel/sequence
      minify: !isDebug,
      lib: {
        entry: {
          pluto: 'src/index.ts',
          'pluto-lowlevel': 'src/lowlevel.ts',
        },
        formats: ['es'],
        fileName: (_f, entryName) => `${entryName}${outExt}`,
      },
    },
    worker: {
      format: 'es',
    },
    server: {
      headers: ISOLATION_HEADERS,
    },
    preview: {
      headers: ISOLATION_HEADERS,
    },
  };
});

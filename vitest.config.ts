import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/rhi/**',
        'src/shaders/**',
        'src/devtools/**',
        // Worker + SharedArrayBuffer はブラウザテストで検証する (docs/10-testing-strategy.md §2)
        'src/jobs/threaded-scheduler.ts',
        'src/jobs/worker-entry.ts',
        'src/worker-main.ts',
        'src/build-flags.d.ts',
        'src/index.ts',
        'src/lowlevel.ts',
      ],
      thresholds: {
        'src/core/**': { lines: 95, branches: 90 },
        'src/jobs/**': { lines: 90, branches: 85 },
        'src/transform/**': { lines: 90, branches: 85 },
        'src/animation/**': { lines: 90, branches: 85 },
        'src/physics/**': { lines: 90, branches: 85 },
        'src/**': { lines: 85, branches: 80 },
      },
    },
  },
  define: {
    __PARALLEL__: 'false',
    __DEBUG__: 'true',
    __VERSION__: '"test"',
  },
});

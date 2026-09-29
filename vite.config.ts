import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'safari15',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  test: {
    include: ['tests/**/*.test.ts', 'tools/**/*.sim.ts'],
  },
} as any);

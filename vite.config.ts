import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths so the built site works at https://<user>.github.io/<repo>/
  base: './',
  plugins: [svelte()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});

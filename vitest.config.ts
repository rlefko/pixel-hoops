import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Unit tests cover the pure game logic only (the engine and helpers under
// src/game). They run in Node, so nothing here may import React Native.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});

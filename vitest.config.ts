import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 180000, // 3 min timeout for RPC calls
    hookTimeout: 300000, // 5 min timeout for setup/teardown (deployment)
    reporters: ['verbose'],
    // Run test files sequentially to avoid nonce conflicts during deployment
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/']
    }
  },
  resolve: {
    alias: {
      '@': './src'
    }
  }
})
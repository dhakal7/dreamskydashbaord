import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

declare module 'vite' {
  interface UserConfig {
    test?: {
      exclude?: string[]
    }
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    exclude: [...configDefaults.exclude, 'src/tests/production-cleanliness.test.mjs'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port: 8000,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})

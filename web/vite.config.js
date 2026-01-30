import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// MagisAI Training Hub - Vite Configuration
// Security: No secrets in config - all API keys entered at runtime

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy to local backend server (if running main.py)
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  build: {
    // Production build optimizations
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,  // Remove console.logs in production
        drop_debugger: true
      }
    }
  }
})

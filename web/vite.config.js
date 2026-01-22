import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        },
        '/weaviate-proxy': {
          target: env.VITE_WEAVIATE_URL || 'https://localhost:8080',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/weaviate-proxy/, ''),
          headers: {
            'Authorization': `Bearer ${env.VITE_WEAVIATE_API_KEY || ''}`,
            'X-Weaviate-Cluster-Url': env.VITE_WEAVIATE_URL || '',
            'X-Weaviate-Api-Key': env.VITE_WEAVIATE_API_KEY || ''
          }
        }
      }
    }
  }
})

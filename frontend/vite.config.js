import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true, // Do not silently switch to another port if 5173 is occupied
    cors: true,
    hmr: {
      overlay: true, // Show compilation / syntax errors in overlay instead of blank page
    },
    watch: {
      usePolling: false,
      ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.venv/**', '**/uploads/**']
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            console.warn(
              '[Vite Proxy] Backend at 127.0.0.1:8000 temporarily unreachable (backend may be reloading). Error:',
              err.code || err.message
            );
            if (res) {
              if (typeof res.writeHead === 'function' && !res.headersSent) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  error: 'BackendServiceTemporarilyUnavailable',
                  message: 'The BiasGuard AI backend is temporarily reloading or restarting. Please retry in a few seconds.',
                  code: err.code || 'PROXY_ERROR'
                }));
              } else if (typeof res.destroy === 'function') {
                res.destroy();
              }
            }
          });
        }
      }
    }
  }
})

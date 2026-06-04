import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],

  define: {
    global: 'globalThis',
  },

  resolve: {
    /**
     * Force ALL imports of 'yjs' — from our code, y-websocket, y-indexeddb,
     * y-codemirror.next, and anywhere else — to resolve to the exact same
     * physical file. Without this, Vite's pre-bundler may give each package
     * its own private yjs copy. Two yjs instances means two independent sets
     * of Y.Doc / Y.Text classes. instanceof checks fail silently and the
     * ySync CodeMirror plugin cannot communicate with the WebSocket provider.
     *
     * The alias points to the package root; Node resolution picks index.js.
     * dedupe is a belt-and-suspenders second guarantee.
     */
    alias: {
      yjs: path.resolve(__dirname, 'node_modules/yjs'),
    },
    dedupe: ['yjs', 'y-websocket', 'y-codemirror.next'],
  },

  optimizeDeps: {
    /**
     * Pre-bundle all Yjs ecosystem packages together in a single pass.
     * This ensures they all see the same yjs module when Vite builds the
     * optimized dependency cache.
     */
    include: [
      'yjs',
      'y-websocket',
      'y-indexeddb',
      'y-codemirror.next',
    ],
    exclude: ['y-webrtc'],
  },

  server: {
    // Serve index.html for all unmatched routes so /room/<id> paths work.
    historyApiFallback: true,
  },

  preview: {
    historyApiFallback: true,
  },
})

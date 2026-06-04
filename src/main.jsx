import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App.jsx'

/**
 * Room bootstrapping — runs AFTER static imports are evaluated, but that
 * is fine because provider.js initializes with ROOM = 'general' on a bare
 * '/' path, then we navigate away immediately. The WebSocket connection
 * never fully establishes before the page unloads.
 *
 * On the NEXT load (at /room/<id>), provider.js reads the correct room from
 * the pathname and everything initializes correctly.
 *
 * WHY NOT dynamic import?
 * -----------------------
 * Using `await import('./App.jsx')` creates a separate Vite chunk boundary.
 * Vite can duplicate 'yjs' across chunks even with resolve.dedupe. Two yjs
 * instances means ySync (the CodeMirror ↔ Y.Text bridge) and the WebSocket
 * provider use different Y.Doc class references — instanceof checks fail
 * silently and document operations never reach the editor. Awareness still
 * works because it bypasses the Y.Doc sync protocol entirely.
 *
 * Static import = single bundle chunk = single yjs instance = sync works.
 */
const roomMatch = window.location.pathname.match(/^\/room\/([^/]+)/);

if (!roomMatch) {
  // No room in URL — generate one and hard-navigate.
  // Full navigation means the current (wrong-room) provider is discarded.
  const id = Math.random().toString(36).slice(2, 9);
  window.location.replace(`/room/${id}`);
} else {
  // Valid room URL — mount React normally.
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

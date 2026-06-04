/**
 * crdt/provider.js
 *
 * Single integration point between the application and Yjs.
 *
 * ROOM IDENTITY:
 * --------------
 * Room ID comes from the URL path: /room/<id>
 * main.jsx guarantees we only mount after the path is valid, so this
 * always resolves to a real room name — never a fallback.
 *
 * Every browser that navigates to /room/abc123 will:
 *   1. Connect to ws://localhost:1234 via y-websocket
 *   2. Join the room named "abc123" on the server
 *   3. Exchange Yjs state vectors with all other peers in that room
 *   4. Merge any missing operations locally (pure CRDT, no server arbitration)
 *
 * WHY THIS IS CONFLICT-FREE (CRDT semantics):
 * --------------------------------------------
 * Yjs uses YATA — a list-CRDT where every character insertion gets a
 * globally unique ID: (clientID, Lamport clock). Consequently:
 *
 *   - Concurrent insertions at the same position always resolve
 *     deterministically by ID — no server picks a winner.
 *   - Deletions target character IDs, not positions, so they commute
 *     correctly with concurrent insertions.
 *   - Operations commute: op_A ∘ op_B === op_B ∘ op_A. The WebSocket
 *     server is a dumb relay; all merging is local and deterministic.
 *
 * OFFLINE SUPPORT:
 * ----------------
 * IndexeddbPersistence snapshots the Y.Doc to IndexedDB on every change.
 * On reconnect, Yjs performs a state-vector exchange with the server:
 * "I have ops up to clock T from client C" → receive only missing ops.
 * No full document retransmit, no conflict resolution needed.
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

// ---------------------------------------------------------------------------
// Room ID — parsed from /room/<id>. main.jsx guarantees this is valid.
// ---------------------------------------------------------------------------
const match = window.location.pathname.match(/^\/room\/([^/]+)/);
export const ROOM = match ? match[1] : 'general';

// ---------------------------------------------------------------------------
// Y.Doc — the CRDT document. Single source of truth for all document state.
// ---------------------------------------------------------------------------
export const ydoc = new Y.Doc();

// ---------------------------------------------------------------------------
// Y.Text — the shared sequence CRDT bound to the CodeMirror editor.
// All reads/writes to the document MUST go through this object.
// ---------------------------------------------------------------------------
export const yText = ydoc.getText('content');

// ---------------------------------------------------------------------------
// WebSocket Provider — relays Yjs updates between all peers in this room.
// The server at localhost:1234 is a thin message router; it does NOT
// interpret document content or resolve conflicts.
// ---------------------------------------------------------------------------
const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:1234';
export const provider = new WebsocketProvider(
  wsUrl,
  ROOM,
  ydoc,
  { connect: true }
);

// ---------------------------------------------------------------------------
// Awareness — ephemeral presence layer. NOT persisted in the CRDT document.
// Carries: cursor anchor/head positions, user display name, user color.
// State auto-expires when a peer disconnects (30s heartbeat timeout).
// ---------------------------------------------------------------------------
export const awareness = provider.awareness;

// ---------------------------------------------------------------------------
// IndexedDB Persistence — offline snapshot and fast initial load.
// ---------------------------------------------------------------------------
export const persistence = new IndexeddbPersistence(ROOM, ydoc);

persistence.once('synced', () => {
  console.log(`[CRDT] IndexedDB ready — room: ${ROOM}`);
});

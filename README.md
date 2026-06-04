# CRDT Collaborative Editor

Real-time peer-to-peer document editing with conflict-free merge semantics.
No server stores your document. No operational transforms. No last-write-wins.

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + Vite |
| CRDT engine | [Yjs](https://github.com/yjs/yjs) |
| Transport | [y-webrtc](https://github.com/yjs/y-webrtc) (WebRTC peer-to-peer) |
| Persistence | [y-indexeddb](https://github.com/yjs/y-indexeddb) (offline support) |
| Editor | [CodeMirror 6](https://codemirror.net/) |
| Yjs ↔ CM binding | [y-codemirror.next](https://github.com/yjs/y-codemirror.next) |
| Presence | Yjs Awareness protocol |

---

## Architecture: CRDTs for People Who Know React but Not CRDTs

### The problem with naive collaborative editing

The simple approach — send every edit to a server, server applies them in order, broadcast back — breaks under concurrency. If Alice inserts "X" at position 5 at the same time as Bob inserts "Y" at position 5, both see their own edit locally but the server has to pick a winner. Last-write-wins loses data. Operational Transform (OT, used by Google Docs) requires a central server to sequence every operation. Both approaches need infrastructure.

### What CRDTs do differently

A **Conflict-free Replicated Data Type** is a data structure with a mathematical guarantee: any two replicas that have seen the same set of operations will converge to the same state — regardless of what order they received those operations.

Yjs uses a list-CRDT called **YATA** (Yet Another Transformation Approach). Every character inserted into a `Y.Text` gets a globally unique ID: `(clientID, Lamport clock)`. This means:

1. **Insertions at the same position** can always be deterministically ordered by their IDs. No server, no arbitration.
2. **Deletions** reference character IDs, not positions. Deleting character `#(42, 7)` is still valid even if other characters were inserted before it concurrently.
3. **Operations commute**: `op_A ∘ op_B = op_B ∘ op_A`. The result is the same regardless of arrival order.

### The Y.Doc model

```
Y.Doc (CRDT document)
 └── yText: Y.Text  ← sequence CRDT, one character per item
```

The `Y.Doc` is the single source of truth. When you type a character, `y-codemirror.next` translates the CodeMirror transaction into a `yText.insert(pos, char)` CRDT operation. When a peer sends an update, Yjs merges it into the local `Y.Doc` and fires a `yText.observe` event, which `y-codemirror.next` translates back into a CodeMirror transaction. The editor never touches document state directly.

### The Awareness protocol

Awareness is a **separate** layer from the CRDT document. It's an ephemeral key-value store per peer:

```js
awareness.setLocalStateField('user', { name: 'Alice', color: '#61afef' })
// This broadcasts to all peers via the same WebRTC channel.
// It is NOT stored in the CRDT document — no history, no persistence.
```

When a peer disconnects (or fails to send a heartbeat), their awareness state is automatically removed. This is how the presence list and live cursors work.

### Offline support

`y-indexeddb` snapshots the `Y.Doc` to IndexedDB on every update. On page reload, the document is restored from IndexedDB before the WebRTC provider connects. When the peer reconnects, Yjs performs a **state vector exchange**: each peer says "I have operations up to clock T from client C." The other peer sends only the missing operations. Pure CRDT merge — no full document retransmission.

---

## Running locally

```bash
npm install
npm run dev
# Opens on http://localhost:5173/
```

Open the same URL in **two browser tabs** (or two browsers) to test collaboration. The URL hash (`#xxxxxxx`) is the room identifier — share it to collaborate.

The WebRTC transport uses `wss://y-webrtc-eu.fly.dev` for signaling (WebRTC offer/answer exchange only — document data flows peer-to-peer). For a fully self-hosted deployment, run your own signaling server:

```bash
# Self-host the signaling server
npx y-webrtc-signaling --port 4444
# Then change the signaling URL in src/crdt/provider.js
```

---

## Swapping to y-websocket

If you have a server available, swap the transport in `src/crdt/provider.js`:

```js
// Replace this:
import { WebrtcProvider } from 'y-webrtc'
export const provider = new WebrtcProvider(ROOM, ydoc, { ... })

// With this:
import { WebsocketProvider } from 'y-websocket'
export const provider = new WebsocketProvider('ws://localhost:1234', ROOM, ydoc)
```

The rest of the application — editor binding, presence, offline support — doesn't change. The provider is the only transport abstraction.

---

## Project structure

```
src/
├── crdt/
│   └── provider.js          # Y.Doc, WebRTC provider, Awareness — isolated
├── components/
│   ├── Editor.jsx            # CodeMirror 6 + y-codemirror.next binding
│   ├── PresenceBar.jsx       # Connected users from Awareness state
│   ├── StatusBar.jsx         # Connection/sync state from provider events
│   ├── Toolbar.jsx           # Top bar with room ID and copy link
│   └── UserSetup.jsx         # Display name bootstrap modal
├── styles/
│   └── index.css             # Design tokens + component styles
├── App.jsx                   # Root — identity bootstrap flow
└── main.jsx                  # React entry point
```

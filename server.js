/**
 * server.js — Minimal Yjs WebSocket relay server
 *
 * WHY WE WRITE OUR OWN:
 * ----------------------
 * @y/websocket-server ships @y/y — a fork of yjs with a different internal
 * API (store.getClock vs store.getState). Client updates encoded with yjs@13
 * are binary-incompatible with @y/y. The server crashes with:
 *   "TypeError: store.getClock is not a function"
 *
 * This server uses the SAME yjs and y-protocols packages that are installed
 * in this project (node_modules/yjs, node_modules/y-protocols), guaranteeing
 * full binary compatibility with the browser client.
 *
 * WHAT THIS SERVER DOES:
 * ----------------------
 * It is a dumb relay with in-memory document state per room:
 *   1. On connect: send the current doc state (sync step 1)
 *   2. On message: forward to all other clients in the room (sync step 2)
 *   3. On disconnect: clean up awareness state
 *
 * It does NOT persist documents to disk — that's handled client-side by
 * y-indexeddb. It does NOT resolve CRDT conflicts — Yjs does that locally
 * on each client. The server only makes sure everyone gets everyone else's
 * operations.
 *
 * USAGE:
 *   node server.js              # runs on port 1234
 *   PORT=4000 node server.js   # custom port
 */

import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const PORT = parseInt(process.env.PORT || '1234', 10);

// ---------------------------------------------------------------------------
// Message type constants — must match y-websocket client
// ---------------------------------------------------------------------------
const MESSAGE_SYNC      = 0;
const MESSAGE_AWARENESS = 1;

// ---------------------------------------------------------------------------
// In-memory store of shared docs, keyed by room name.
// Each room has: a Y.Doc, an AwarenessState, and a Set of connected sockets.
// ---------------------------------------------------------------------------
const rooms = new Map();

function getRoom(roomName) {
  if (rooms.has(roomName)) return rooms.get(roomName);

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);

  awareness.on('update', ({ added, updated, removed }, _origin) => {
    // Broadcast awareness updates to all clients in the room
    const changedClients = [...added, ...updated, ...removed];
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
    );
    const message = encoding.toUint8Array(encoder);
    const room = rooms.get(roomName);
    if (room) {
      for (const ws of room.clients) {
        if (ws.readyState === WebSocket.OPEN) ws.send(message);
      }
    }
  });

  const room = { doc, awareness, clients: new Set() };
  rooms.set(roomName, room);

  doc.on('update', (update, _origin, _doc, _tr) => {
    // Broadcast document updates to all clients in the room
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    const r = rooms.get(roomName);
    if (r) {
      for (const ws of r.clients) {
        if (ws.readyState === WebSocket.OPEN) ws.send(message);
      }
    }
  });

  return room;
}

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
  // Room name comes from the URL path: ws://localhost:1234/<roomName>
  const roomName = (req.url || '/').slice(1) || 'general';
  const room = getRoom(roomName);
  room.clients.add(ws);

  console.log(`[+] ${roomName} — ${room.clients.size} client(s)`);

  // Send sync step 1: our current state vector so the client knows what we have
  const encoder1 = encoding.createEncoder();
  encoding.writeVarUint(encoder1, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder1, room.doc);
  ws.send(encoding.toUint8Array(encoder1));

  // Send current awareness states
  const awarenessStates = room.awareness.getStates();
  if (awarenessStates.size > 0) {
    const encoder2 = encoding.createEncoder();
    encoding.writeVarUint(encoder2, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder2,
      awarenessProtocol.encodeAwarenessUpdate(
        room.awareness,
        Array.from(awarenessStates.keys())
      )
    );
    ws.send(encoding.toUint8Array(encoder2));
  }

  ws.on('message', (data) => {
    const decoder = decoding.createDecoder(new Uint8Array(data));
    const msgType = decoding.readVarUint(decoder);

    if (msgType === MESSAGE_SYNC) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      // Handle sync steps 1 and 2; may generate a step 2 response
      const syncMessageType = syncProtocol.readSyncMessage(
        decoder, encoder, room.doc, null
      );
      if (syncMessageType === syncProtocol.messageYjsSyncStep1) {
        // Send our state back (step 2) only to this client
        if (encoding.length(encoder) > 1) {
          ws.send(encoding.toUint8Array(encoder));
        }
      }
    } else if (msgType === MESSAGE_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(
        room.awareness,
        decoding.readVarUint8Array(decoder),
        ws
      );
    }
  });

  ws.on('close', () => {
    room.clients.delete(ws);
    // Remove this client's awareness state
    awarenessProtocol.removeAwarenessStates(
      room.awareness,
      Array.from(room.awareness.getStates().keys()).filter(
        (clientId) => clientId === room.doc.clientID
      ),
      null
    );
    console.log(`[-] ${roomName} — ${room.clients.size} client(s)`);
    // Clean up empty rooms
    if (room.clients.size === 0) {
      rooms.delete(roomName);
    }
  });

  ws.on('error', (err) => {
    console.error(`[!] WebSocket error in room ${roomName}:`, err.message);
  });
});

console.log(`Yjs WebSocket server running on ws://localhost:${PORT}`);
console.log(`yjs version: ${Y.Doc.prototype.constructor.name} (from project node_modules)`);

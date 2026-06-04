/**
 * UserSetup.jsx
 *
 * One-time modal that captures the user's display name on first visit.
 * The name is stored in localStorage and injected into the Yjs Awareness
 * state so other peers can display it next to the cursor.
 *
 * This is NOT a login — it's purely a display name for the session.
 */

import { useState, useEffect } from 'react';
import { awareness } from '../crdt/provider';

// ---------------------------------------------------------------------------
// 8 distinct, saturated colors for cursor/presence assignment.
// Each new session picks from this list by hashing the clientId.
// Colors are intentionally bold — they need to be visible on a dark editor
// background at small cursor-label size.
// ---------------------------------------------------------------------------
export const CURSOR_COLORS = [
  '#e06c75', // red
  '#61afef', // blue
  '#e5c07b', // amber
  '#98c379', // green
  '#c678dd', // purple
  '#56b6c2', // cyan
  '#d19a66', // orange
  '#be5046', // brick
];

function getColorForClient(clientId) {
  // Simple deterministic hash so the same client always gets the same color
  return CURSOR_COLORS[clientId % CURSOR_COLORS.length];
}

const STORAGE_KEY = 'crdt-editor-username';

export default function UserSetup({ onReady }) {
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  // Check if we already have a name stored
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      activateUser(saved);
    }
  }, []);

  function activateUser(displayName) {
    const trimmed = displayName.trim();
    if (!trimmed) return;

    // Set awareness state: this broadcasts to all peers immediately.
    // Other peers will see this user appear in their PresenceBar and
    // see their cursor label update.
    const color = getColorForClient(awareness.clientID);
    awareness.setLocalStateField('user', {
      name: trimmed,
      color,
    });

    localStorage.setItem(STORAGE_KEY, trimmed);
    setSubmitted(true);
    onReady();
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setError('');
    activateUser(name);
  }

  if (submitted) return null;

  return (
    <div className="setup-overlay" role="dialog" aria-modal="true" aria-labelledby="setup-title">
      <div className="setup-modal">
        <div className="setup-header">
          <h1 id="setup-title" className="setup-title">CRDT Editor</h1>
          <p className="setup-subtitle">Collaborative document — real-time, conflict-free</p>
        </div>

        <form className="setup-form" onSubmit={handleSubmit}>
          <label htmlFor="display-name" className="setup-label">
            Display name
          </label>
          <input
            id="display-name"
            type="text"
            className={`setup-input ${error ? 'setup-input--error' : ''}`}
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            placeholder="e.g. Alice"
            maxLength={32}
            autoFocus
            autoComplete="nickname"
            spellCheck={false}
          />
          {error && <span className="setup-error" role="alert">{error}</span>}

          <button type="submit" className="setup-submit" id="join-editor-btn">
            Join editor
          </button>
        </form>

        <div className="setup-meta">
          <p>
            Your edits sync peer-to-peer via WebRTC using{' '}
            <strong>Yjs CRDT</strong> — no server stores your document.
          </p>
          <p>
            Open the same URL in another tab or share it to collaborate.
          </p>
        </div>
      </div>
    </div>
  );
}

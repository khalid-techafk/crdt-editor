/**
 * PresenceBar.jsx
 *
 * Displays the list of currently connected collaborators by reading from
 * the Yjs Awareness protocol.
 *
 * HOW AWARENESS WORKS:
 * --------------------
 * The Awareness API is a separate key-value store sitting on top of the CRDT
 * transport. Each connected client has a "local state" object:
 *   { user: { name: string, color: string }, cursor: { anchor, head } }
 *
 * Yjs broadcasts this state to all peers whenever it changes. When a peer
 * disconnects (or fails to send a heartbeat within 30s), their state is
 * automatically removed. This means the presence list is always accurate
 * without any explicit "leave" message — the protocol handles it.
 *
 * This is NOT stored in the CRDT document — it's ephemeral and not persisted.
 */

import { useState, useEffect } from 'react';
import { awareness } from '../crdt/provider';

export default function PresenceBar() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    function updateUsers() {
      // awareness.getStates() returns a Map<clientId, state>
      // We convert it to an array, filtering out entries with no user data.
      const states = Array.from(awareness.getStates().entries())
        .map(([clientId, state]) => ({ clientId, ...state?.user }))
        .filter((u) => u.name);

      setUsers(states);
    }

    // Fired on any awareness change: local or remote join/leave/update
    awareness.on('change', updateUsers);
    updateUsers(); // prime on mount

    return () => awareness.off('change', updateUsers);
  }, []);

  if (users.length === 0) return null;

  return (
    <div className="presence-bar" role="region" aria-label="Connected users">
      <span className="presence-label">
        {users.length} {users.length === 1 ? 'user' : 'users'}
      </span>
      <div className="presence-list">
        {users.map((user) => (
          <div
            key={user.clientId}
            className="presence-chip"
            title={user.name}
            aria-label={`${user.name} is connected`}
          >
            {/* Color dot — matches the cursor color for this user */}
            <span
              className="presence-dot"
              style={{ backgroundColor: user.color }}
            />
            <span className="presence-name">{user.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

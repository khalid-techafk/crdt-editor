/**
 * StatusBar.jsx
 *
 * Shows the WebSocket provider connection status.
 * Listens to `provider.on('status', ...)` events from y-websocket.
 *
 * y-websocket status events fire with { status: 'connected' | 'connecting' | 'disconnected' }
 * It also fires 'sync' when the document has been fully synced with the server.
 *
 * The 150ms transition on state change is the only animation in the UI —
 * it exists because a hard cut between status states reads as a glitch.
 */

import { useState, useEffect } from 'react';
import { provider, ROOM } from '../crdt/provider';

const STATUS_MAP = {
  connected: {
    label: 'connected',
    className: 'status--connected',
    dot: '#e5c07b', // amber — connected to server but not yet synced
  },
  synced: {
    label: 'synced',
    className: 'status--connected',
    dot: '#4caf50', // green — fully synced with server and peers
  },
  connecting: {
    label: 'connecting',
    className: 'status--connecting',
    dot: '#e5c07b',
  },
  disconnected: {
    label: 'offline · ws server not running?',
    className: 'status--disconnected',
    dot: '#e06c75',
  },
};

export default function StatusBar() {
  // y-websocket starts in 'connecting' state
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
    /**
     * y-websocket fires 'status' with { status: string }
     * Possible values: 'connected', 'connecting', 'disconnected'
     */
    function onStatus({ status: s }) {
      setStatus(s);
    }

    /**
     * y-websocket fires 'sync' with a boolean once the initial
     * state vector exchange with the server completes.
     * true = fully synced; false = lost sync (server restarted etc.)
     */
    function onSync(isSynced) {
      if (isSynced) setStatus('synced');
    }

    provider.on('status', onStatus);
    provider.on('sync', onSync);

    return () => {
      provider.off('status', onStatus);
      provider.off('sync', onSync);
    };
  }, []);

  const config = STATUS_MAP[status] ?? STATUS_MAP.connecting;

  return (
    <div className={`status-bar ${config.className}`} role="status" aria-live="polite">
      <div className="status-left">
        <span className="status-indicator">
          <span className="status-dot" style={{ backgroundColor: config.dot }} />
          <span className="status-text">{config.label}</span>
        </span>
      </div>
      <div className="status-right">
        <span className="status-room">
          <span className="status-room-label">room</span>
          <code className="status-room-value">{ROOM}</code>
        </span>
        <span className="status-hint">Share this URL to collaborate</span>
      </div>
    </div>
  );
}

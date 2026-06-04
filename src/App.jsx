/**
 * App.jsx
 *
 * Root component. Manages the user identity bootstrap flow:
 *   1. If the user has a saved name (localStorage), set awareness immediately.
 *   2. Otherwise, show the UserSetup modal to capture a display name.
 *   3. Mount the editor once identity is established.
 *
 * NOTE: Room identity is managed entirely in crdt/provider.js.
 * This file does NOT manipulate the URL hash — provider.js owns that.
 */

import { useState, useEffect } from 'react';
import Editor from './components/Editor';
import Toolbar from './components/Toolbar';
import StatusBar from './components/StatusBar';
import UserSetup, { CURSOR_COLORS } from './components/UserSetup';
import { awareness } from './crdt/provider';

export default function App() {
  const [editorReady, setEditorReady] = useState(false);

  useEffect(() => {
    // If the user already has a saved name, bootstrap awareness directly
    // and skip the UserSetup modal.
    const saved = localStorage.getItem('crdt-editor-username');
    if (saved) {
      const color = CURSOR_COLORS[awareness.clientID % CURSOR_COLORS.length];
      awareness.setLocalStateField('user', { name: saved, color });
      setEditorReady(true);
    }
  }, []);

  return (
    <div className="app-shell">
      {!editorReady && (
        <UserSetup onReady={() => setEditorReady(true)} />
      )}

      <Toolbar />

      <main className="editor-main" role="main">
        {editorReady && <Editor />}
      </main>

      <StatusBar />
    </div>
  );
}

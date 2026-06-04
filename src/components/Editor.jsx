/**
 * Editor.jsx
 *
 * Collaborative editor with:
 *   - Yjs CRDT binding via y-codemirror.next (yCollab extension)
 *   - Drag-and-drop file import (.txt / .md → replaces Y.Text content)
 *   - Drop zone indicator (border highlight only, no animation)
 *
 * HOW THE CRDT BINDING WORKS:
 * ----------------------------
 * yCollab() is a CodeMirror Extension that installs two plugins:
 *
 *   ySync — bidirectional bridge between CodeMirror state and Y.Text.
 *     Local edits → CodeMirror Transaction → yText.insert/delete (CRDT op)
 *     Remote updates → Y.Text observe event → CodeMirror Transaction
 *
 *   yRemoteSelections — renders other users' cursors and selections inside
 *     the editor as CodeMirror Decorations, driven by Awareness state.
 *
 * HOW DRAG-AND-DROP FILE IMPORT WORKS:
 * --------------------------------------
 * When a file is dropped, we use FileReader to read it as text, then
 * replace the entire Y.Text content in a single Yjs transaction:
 *
 *   ydoc.transact(() => {
 *     yText.delete(0, yText.length);  // CRDT delete-all
 *     yText.insert(0, fileContent);   // CRDT insert
 *   });
 *
 * Both operations are CRDT ops that sync to all peers immediately.
 * Peers receive the updated document as if they had typed the content
 * themselves — no special "file import" message needed.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { yCollab } from 'y-codemirror.next';
import { ydoc, yText, awareness } from '../crdt/provider';
import { loadFileIntoDoc } from './Toolbar';

// ---------------------------------------------------------------------------
// Y.UndoManager — scoped to this client's ops only.
// Ctrl+Z undoes YOUR changes, never another person's.
// ---------------------------------------------------------------------------
const undoManager = new Y.UndoManager(yText);

// ---------------------------------------------------------------------------
// CodeMirror dark theme — matches the application design tokens exactly.
// ---------------------------------------------------------------------------
const editorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: '14px',
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      backgroundColor: '#111111',
      color: '#e8e8e8',
    },
    '.cm-content': {
      padding: '24px 0',
      caretColor: '#4d7cfe',
      lineHeight: '1.7',
      minHeight: '100%',
    },
    '.cm-line': { padding: '0 32px' },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#4d7cfe',
      borderLeftWidth: '2px',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.02)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.02)' },
    '.cm-gutters': {
      backgroundColor: '#0d0d0d',
      borderRight: '1px solid #2a2a2a',
      color: '#3a3a3a',
      minWidth: '52px',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 12px 0 8px',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '12px',
      lineHeight: '1.7',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(77, 124, 254, 0.25) !important',
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(77, 124, 254, 0.3) !important',
    },
    // Remote cursor name labels — color set inline by Awareness { user.color }
    '.cm-ySelectionInfo': {
      position: 'absolute',
      top: '-1.5em',
      left: '-1px',
      fontSize: '10px',
      fontFamily: "'Inter', sans-serif",
      fontWeight: '600',
      letterSpacing: '0.03em',
      padding: '1px 5px',
      borderRadius: '2px',
      lineHeight: '1.4',
      whiteSpace: 'nowrap',
      userSelect: 'none',
      pointerEvents: 'none',
      zIndex: 10,
      opacity: 0.95,
    },
    '.cm-ySelectionCaretDot': { display: 'none' },
    '.cm-ySelection': { opacity: 0.3 },
    '&.cm-focused': { outline: 'none' },
  },
  { dark: true }
);

const extensions = [
  keymap.of([...defaultKeymap, ...historyKeymap]),
  lineNumbers(),
  drawSelection(),
  highlightActiveLine(),
  markdown(),
  editorTheme,
  EditorView.lineWrapping,
  yCollab(yText, awareness, { undoManager }),
];

export default function Editor() {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // dragCounter tracks nested enter/leave events so we don't flicker
  // when the pointer moves from the container to a child element.
  const dragCounter = useRef(0);

  // -------------------------------------------------------------------------
  // Drag-and-drop handlers
  // -------------------------------------------------------------------------
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    // Tell the browser we want a "copy" drop, not a "move"
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFileIntoDoc(file);
  }, []);

  // -------------------------------------------------------------------------
  // CodeMirror initialization
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;

    viewRef.current = new EditorView({
      state: EditorState.create({
        doc: yText.toString(),
        extensions,
      }),
      parent: containerRef.current,
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  return (
    <div
      className={`editor-wrapper${isDragOver ? ' editor-wrapper--drag-over' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop zone overlay — visible only while dragging a valid file */}
      {isDragOver && (
        <div className="drop-zone-overlay" aria-hidden="true">
          <div className="drop-zone-label">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 3v10M6 9l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Drop .txt or .md to import
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="editor-container"
        aria-label="Collaborative document editor"
        id="main-editor"
      />
    </div>
  );
}

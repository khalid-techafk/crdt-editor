/**
 * Toolbar.jsx
 *
 * Top navigation bar. Includes:
 *   - Brand + room badge
 *   - Live presence bar
 *   - Import button (opens native file picker, accepts .txt and .md)
 *   - Export button (downloads document as .md)
 *   - New room button
 *   - Copy link button (primary action)
 *
 * FILE IMPORT:
 * ------------
 * Clicking "Import file" opens the native OS file picker filtered to
 * .txt and .md. The selected file is read as UTF-8 text and its contents
 * replace the entire Y.Text document in one CRDT transaction — syncing
 * to every connected peer instantly.
 *
 * The same logic lives in Editor.jsx for drag-and-drop. Both paths call
 * the same loadFileIntoDoc() helper so behaviour is identical regardless
 * of how the file was picked.
 */

import { useRef, useState } from 'react';
import PresenceBar from './PresenceBar';
import { ROOM, ydoc, yText } from '../crdt/provider';

// ---------------------------------------------------------------------------
// Shared file-import logic.
// Called from both the toolbar button AND the editor drag-and-drop handler.
// Exported so Editor.jsx can import it too.
// ---------------------------------------------------------------------------
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export function loadFileIntoDoc(file, onDone, onError) {
  if (!file) return;

  const name = file.name.toLowerCase();
  if (!name.endsWith('.txt') && !name.endsWith('.md')) {
    onError?.('Only .txt and .md files are supported');
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    onError?.('File is too large (max 5 MB)');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    // Replace the entire document in one CRDT transaction.
    // A transaction batches delete + insert into a single sync message
    // so peers receive one atomic update rather than two.
    ydoc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, content);
    });
    onDone?.(file.name);
  };
  reader.onerror = () => onError?.('Could not read file');
  reader.readAsText(file, 'utf-8');
}

// ---------------------------------------------------------------------------
// Toolbar component
// ---------------------------------------------------------------------------
export default function Toolbar() {
  const [copied, setCopied]         = useState(false);
  const [importedFile, setImported] = useState('');   // last imported filename
  const [importError, setImportError] = useState(''); // error message or ''
  const fileInputRef                = useRef(null);

  // -------------------------------------------------------------------------
  // Open the native file picker
  // -------------------------------------------------------------------------
  function openFilePicker() {
    setImportError('');
    fileInputRef.current?.click();
  }

  // -------------------------------------------------------------------------
  // Handle the file-input change event (user selected a file via dialog)
  // -------------------------------------------------------------------------
  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    // Reset the input so the same file can be re-imported if needed
    e.target.value = '';
    loadFileIntoDoc(
      file,
      (name) => { setImported(name); setImportError(''); },
      (msg)  => { setImportError(msg); setImported(''); }
    );
  }

  // -------------------------------------------------------------------------
  // Copy invite link
  // -------------------------------------------------------------------------
  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // -------------------------------------------------------------------------
  // New room
  // -------------------------------------------------------------------------
  function newRoom() {
    const id = Math.random().toString(36).slice(2, 9);
    window.location.href = `/room/${id}`;
  }

  // -------------------------------------------------------------------------
  // Export document as .md
  // -------------------------------------------------------------------------
  function exportDocument() {
    const content  = yText.toString();
    const filename = `doc-${ROOM}.md`;
    const blob     = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    a.href         = url;
    a.download     = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <header className="toolbar" role="banner">
      {/* ----------------------------------------------------------------- */}
      {/* Left — brand + room                                                */}
      {/* ----------------------------------------------------------------- */}
      <div className="toolbar-left">
        <span className="toolbar-brand">
          <span className="toolbar-brand-mark">Y</span>
          <span className="toolbar-brand-name">crdt</span>
        </span>

        <span className="toolbar-divider" aria-hidden="true" />

        <span className="toolbar-room-badge" title={`Room: ${ROOM}`}>
          <span className="toolbar-room-label">room</span>
          <span className="toolbar-room-value">{ROOM}</span>
        </span>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Center — live presence                                             */}
      {/* ----------------------------------------------------------------- */}
      <div className="toolbar-center">
        <PresenceBar />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Right — actions                                                    */}
      {/* ----------------------------------------------------------------- */}
      <div className="toolbar-right">

        {/* Hidden file input — triggered by the Import button below */}
        <input
          ref={fileInputRef}
          type="file"
          id="file-import-input"
          accept=".txt,.md,text/plain,text/markdown"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
          aria-hidden="true"
        />

        {/* Import file button — opens native OS file picker */}
        <button
          id="import-btn"
          className={`toolbar-btn toolbar-btn--ghost ${importError ? 'toolbar-btn--error' : ''}`}
          onClick={openFilePicker}
          title="Import a .txt or .md file — replaces document content and syncs to all users"
          aria-label="Import file"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <path d="M6.5 9V2M3.5 5l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M1 11h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          {importError
            ? <span className="toolbar-btn-label--error" title={importError}>Error</span>
            : importedFile
              ? <span className="toolbar-btn-label--success" title={importedFile}>
                  {importedFile.length > 16
                    ? importedFile.slice(0, 13) + '…'
                    : importedFile}
                </span>
              : 'Import file'
          }
        </button>

        <span className="toolbar-divider" aria-hidden="true" />

        {/* Export */}
        <button
          id="export-btn"
          className="toolbar-btn toolbar-btn--ghost"
          onClick={exportDocument}
          title={`Download doc-${ROOM}.md`}
          aria-label="Export document as Markdown"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <path d="M6.5 2v7M3.5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M1 11h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          Export
        </button>

        {/* New room */}
        <button
          id="new-room-btn"
          className="toolbar-btn toolbar-btn--ghost"
          onClick={newRoom}
          title="Create a new private room"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <path d="M6.5 2v9M2 6.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          New room
        </button>

        {/* Copy link — primary action */}
        <button
          id="copy-link-btn"
          className={`toolbar-btn ${copied ? 'toolbar-btn--success' : 'toolbar-btn--accent'}`}
          onClick={copyLink}
          aria-label="Copy invite link for this room"
          title="Copy this URL — anyone who opens it joins this room instantly"
        >
          {copied ? (
            <>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                <path d="M2 6.5l3.5 3.5 5.5-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                <rect x="1" y="4" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M4 4V3a1 1 0 011-1h5a1 1 0 011 1v6a1 1 0 01-1 1H9" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
              Copy link
            </>
          )}
        </button>
      </div>
    </header>
  );
}

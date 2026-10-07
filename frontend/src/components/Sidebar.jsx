import UploadButton from './UploadButton.jsx';

export default function Sidebar({ recaps, selected, onSelect, onUpload, uploading }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>ConceptCraft</h1>
        <p>Slide decks → recap + concept map</p>
      </div>
      <UploadButton onUpload={onUpload} disabled={uploading} />
      <nav className="recap-list">
        {recaps.length === 0 ? (
          <p className="muted">No recaps yet.</p>
        ) : (
          recaps.map((r) => (
            <button
              key={r.deck}
              type="button"
              className={`recap-item${r.deck === selected ? ' selected' : ''}`}
              onClick={() => onSelect(r.deck)}
            >
              <span className="deck-name">{r.deck}</span>
              {r.hasMap && (
                <span className="badge" title="Has concept map">
                  map
                </span>
              )}
            </button>
          ))
        )}
      </nav>
    </aside>
  );
}

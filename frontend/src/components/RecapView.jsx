import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import Mermaid from './Mermaid.jsx';
import { mapUrl } from '../api.js';

function toText(children) {
  if (Array.isArray(children)) return children.map(toText).join('');
  if (children == null || typeof children === 'boolean') return '';
  return String(children);
}

function Markdown({ markdown }) {
  return (
    <ReactMarkdown
      components={{
        pre({ children }) {
          const child = Array.isArray(children) ? children[0] : children;
          const cls = child?.props?.className;
          if (typeof cls === 'string' && cls.includes('language-mermaid')) {
            return <>{children}</>;
          }
          return <pre>{children}</pre>;
        },
        code({ node, className, children, ...props }) {
          if (typeof className === 'string' && className.includes('language-mermaid')) {
            return <Mermaid chart={toText(children).replace(/\n+$/, '')} />;
          }
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}

function ConceptMap({ deck }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <p className="muted">Could not load the concept map for {deck}.</p>;
  }
  return (
    <img
      className="concept-map"
      src={mapUrl(deck)}
      alt={`Concept map for ${deck}`}
      onError={() => setFailed(true)}
    />
  );
}

function Spinner({ label }) {
  return (
    <div className="loading">
      <span className="spinner" />
      {label}
    </div>
  );
}

export default function RecapView({ deck, markdown, loading, tab, onTabChange, hasMap }) {
  if (!deck) {
    return (
      <div className="empty">
        <p>No recap selected.</p>
        <p className="muted">Upload a lecture PDF to generate one.</p>
      </div>
    );
  }
  return (
    <div className="recap-view">
      <header className="recap-header">
        <h2>{deck}</h2>
        <div className="tabs">
          <button
            type="button"
            className={tab === 'markdown' ? 'active' : ''}
            onClick={() => onTabChange('markdown')}
          >
            Markdown
          </button>
          {hasMap && (
            <button
              type="button"
              className={tab === 'map' ? 'active' : ''}
              onClick={() => onTabChange('map')}
            >
              Concept map
            </button>
          )}
        </div>
      </header>
      <div className="recap-body">
        {tab === 'markdown' ? (
          loading ? (
            <Spinner label="Loading recap…" />
          ) : markdown ? (
            <Markdown markdown={markdown} />
          ) : (
            <p className="muted">Nothing to show.</p>
          )
        ) : (
          <ConceptMap key={deck} deck={deck} />
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import RecapView from './components/RecapView.jsx';
import { fetchRecaps, fetchMarkdown, uploadPdf } from './api.js';

function ErrorBanner({ error, onDismiss, onRetry }) {
  return (
    <div className="error-banner" role="alert">
      <div className="error-text">
        <strong>Something went wrong:</strong> {error.message}
        {error.detail && <pre className="error-detail">{error.detail}</pre>}
      </div>
      <div className="error-actions">
        <button type="button" onClick={onRetry}>
          Retry
        </button>
        <button type="button" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [recaps, setRecaps] = useState([]);
  const [selected, setSelected] = useState(null);
  const [markdown, setMarkdown] = useState(null);
  const [tab, setTab] = useState('markdown');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const selectRecap = useCallback(async (deck) => {
    setSelected(deck);
    setMarkdown(null);
    setTab('markdown');
    setError(null);
    setLoading(true);
    try {
      setMarkdown(await fetchMarkdown(deck));
    } catch (err) {
      setError({ message: err.message, detail: err.detail });
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const list = await fetchRecaps();
      setRecaps(list);
      if (list.length > 0) {
        await selectRecap(list[0].deck);
      } else {
        setSelected(null);
        setMarkdown(null);
      }
    } catch (err) {
      setError({ message: err.message, detail: err.detail });
    }
  }, [selectRecap]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleUpload = async (file) => {
    setUploading(true);
    setError(null);
    try {
      const { deck } = await uploadPdf(file);
      setRecaps(await fetchRecaps());
      await selectRecap(deck);
      // the concept map finishes rendering a few seconds after the recap returns
      setTimeout(async () => {
        try {
          setRecaps(await fetchRecaps());
        } catch {
          /* ignore refresh failure */
        }
      }, 12000);
    } catch (err) {
      setError({ message: err.message, detail: err.detail });
    } finally {
      setUploading(false);
    }
  };

  const retry = () => {
    if (selected) selectRecap(selected);
    else refresh();
  };

  const hasMap = Boolean(recaps.find((r) => r.deck === selected)?.hasMap);

  return (
    <div className="app">
      <Sidebar
        recaps={recaps}
        selected={selected}
        onSelect={selectRecap}
        onUpload={handleUpload}
        uploading={uploading}
      />
      <main className="main">
        {error && (
          <ErrorBanner error={error} onDismiss={() => setError(null)} onRetry={retry} />
        )}
        {uploading && (
          <div className="upload-status">
            <span className="spinner" />
            Running opencode… this takes about a minute. You can watch the current recap
            while you wait.
          </div>
        )}
        <RecapView
          deck={selected}
          markdown={markdown}
          loading={loading}
          tab={tab}
          onTabChange={setTab}
          hasMap={hasMap}
        />
      </main>
    </div>
  );
}

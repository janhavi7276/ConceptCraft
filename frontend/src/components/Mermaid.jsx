import { useEffect, useId, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'neutral' });

export default function Mermaid({ chart }) {
  const rawId = useId();
  const id = `mmd${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const [svg, setSvg] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);
    mermaid
      .render(id, chart)
      .then((result) => {
        if (!cancelled) setSvg(result.svg);
      })
      .catch(() => {
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id, chart]);

  if (failed) {
    return (
      <pre className="mermaid-fallback" title="Mermaid failed to parse this diagram">
        {chart}
      </pre>
    );
  }
  if (!svg) return <div className="mermaid-loading">Rendering diagram…</div>;
  return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}

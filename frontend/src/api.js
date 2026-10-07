async function handle(res, parse) {
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.detail = body?.detail;
    throw err;
  }
  return parse ? body : text;
}

export async function fetchRecaps() {
  const res = await fetch('/api/recaps');
  return handle(res, true);
}

export async function fetchMarkdown(deck) {
  const res = await fetch(`/api/recaps/${encodeURIComponent(deck)}`);
  return handle(res, false);
}

export async function uploadPdf(file) {
  const form = new FormData();
  form.append('pdf', file);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  return handle(res, true);
}

export function mapUrl(deck) {
  return `/api/map/${encodeURIComponent(deck)}`;
}

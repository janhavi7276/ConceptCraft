# ConceptCraft — Frontend Plan

A minimal web UI over the existing pipeline: browse recaps in `output/`, render
Markdown + Mermaid, and upload a PDF that runs `opencode run` server-side.

Stack: Vite + React in `frontend/`, Express in `server/`. Plain JavaScript.

## Layout

    PLAN-FRONTEND.md
    server/
      index.js        # Express app: list/read recaps, upload -> opencode run
    frontend/          # Vite + React (create-vite "react" template)
      src/
        main.jsx
        App.jsx        # layout, state (recaps, selection, loading, error, upload)
        api.js         # fetch helpers for /api/*
        styles.css
        components/
          Sidebar.jsx      # recap list + upload control
          RecapView.jsx    # tabs: Markdown | Concept map, loading/error slots
          Mermaid.jsx      # renders a ```mermaid block via mermaid.render()
          UploadButton.jsx # file input + POST /api/upload

## Server API (port 3001, CORS enabled)

- `GET /api/recaps` → `[{ deck, mtime, hasMap }]`, scanned from `output/*-recap.md`
  (deck = filename minus `-recap.md`, sorted newest first; `hasMap` is true if a
  `*-concept-map.svg` **or** `*-concept-map.png` exists — the mermaid MCP may emit either)
- `GET /api/recaps/:deck` → recap Markdown as text
  - `deck` validated against `^[A-Za-z0-9_-]+$` (blocks path traversal)
- `GET /api/map/:deck` → the concept map as `image/svg+xml` or `image/png`
  (404 if absent)
- `POST /api/upload` → `multipart/form-data`, field `pdf`
  1. Reject non-`.pdf` (400). Sanitize filename to `[A-Za-z0-9_-]`, save to
     `input/.uploads/<deck>.pdf` first (never write to `input/<deck>.pdf` directly —
     truncating the source while the client is still sending destroys it), then
     `renameSync` into `input/<deck>.pdf` after the full body is received
  2. Single-run lock: 409 `{ error: "A run is already in progress" }` if busy
     (the temp file is removed; the existing `input/` PDF is untouched)
  3. Spawn `opencode run "<prompt>" --auto --variant minimal` with `cwd` = repo root,
     `shell: true` on win32. The prompt drives a single fast pass: read the PDF once,
     no sub-agents, no reviewer, compact recap, and the recap `Write` + mermaid call
     issued in the same assistant message.
     **`stdio: ['ignore', 'pipe', 'pipe']`** — with a piped stdin, `opencode run`
     waits for EOF that never comes and hangs forever
  4. **Respond in ~1 minute**: the server polls for a fresh `output/<deck>-recap.md`
     (mtime newer than pre-spawn) and returns it as soon as it lands — typically
     30-50 s. The concept map finishes rendering seconds later; the run lock stays
     held until the child exits, so a 409 in that tail window is expected.
     Timeout: 60 s (override with env `RUN_TIMEOUT_MS`) → kill process tree → 504
     unless the recap already exists. Full child output → `server/last-run.log`
  5. Recap present → 200 `{ deck, markdown }`; no recap on exit/timeout →
     500/504 `{ error, detail: <output tail> }`
- Error middleware → JSON `{ error }` for all failures; upload JSON body limit not needed
  (multer handles the file, 50 MB cap)

## Frontend

- Vite dev proxy: `/api` → `http://localhost:3001`
- **Sidebar** — lists recaps from `GET /api/recaps`; file input styled as an
  "Upload PDF" button; clicking a recap loads it
- **Viewer** (`RecapView`)
  - Tab 1 Markdown: `react-markdown`, custom `code` component detects
    `language-mermaid` → `Mermaid.jsx` runs `mermaid.render()` in an effect,
    shows raw source text if parsing fails (never crashes the page)
  - Tab 2 Concept map: static `GET /api/svg/:deck` via `<img>` (hidden when `hasSvg` false)
- **Loading** — spinner while fetching a recap; during upload a blocking
  "Running opencode… this takes about a minute" state (POST returns the finished
  recap). After a successful upload the sidebar list refreshes once more after 12 s
  so the Concept map tab appears when the map finishes rendering just after the
  response.
- **Errors** — dismissible banner fed by a single `error` state
  (fetch failures, 4xx/5xx from upload, server down) + Retry on the empty state
- State lives in `App.jsx` (no router, no state library — minimal)

## Implementation steps

1. Write this file
2. `server/index.js` + root scripts `dev:server`, `dev:client`; gitignore `frontend/dist`
3. Scaffold `frontend/` (`npm create vite@latest frontend -- --template react`),
   install `react-markdown`, `mermaid`
4. API client, sidebar, Markdown/Mermaid/SVG viewer
5. Upload flow with loading and error states
6. Verify (below)

## Verification

1. `npm run dev:server` and `npm run dev:client` in two terminals
2. `GET /api/recaps` lists `AAPLecture5_RAG_Fundamentals`
3. App renders the recap; the Concept Map tab shows the SVG; the Mermaid block
   renders as a diagram (and a broken block degrades to raw text)
4. Stop the server → banner shows the network error; restart → Retry works
5. Upload a PDF end-to-end (slow: full agent run) → new recap appears in the
   sidebar and opens; concurrent upload while running → 409 banner

## 1-minute fast path (2026-10-06, same day)

Original full pipeline (summarizer + reviewer sub-agents) took ~10-23 min. Changes:
single-pass prompt (no sub-agents/reviewer, compact output, recap+mermaid in one
message), `--variant minimal`, respond as soon as the recap file exists, 60 s cap.
Measured response times: L2 **33 s**, L3 **51 s**, L4 **51 s**; each concept map
landed ~3 s after its response; lock correctly held during that tail (early retries
get 409). Note: back-to-back uploads wait for the previous run's tail to finish.

## Verification results (2026-10-06)

- Endpoints: list/markdown/map 200; path traversal 400; missing recap/map 404;
  non-PDF upload 400; concurrent upload 409 (source PDF verified untouched, temp cleaned)
- Vite proxy 200; server stopped → 502 (error banner path); restart → 200 (Retry)
- React mapping tested in Node: mermaid block unwrapped from `<pre>`, AST `node`
  prop stripped, plain code blocks unchanged; `vite build` passes
- **Full E2E upload**: `AAPLecture1_LLM_Foundations.pdf` → opencode ran
  skill → pdf extract → @summarizer → @reviewer → mermaid, ~10 min, returned
  `{ deck, markdown }`; `output/` gained the recap + a concept-map **PNG**
  (hence `/api/map` accepts svg or png)

Bugs found and fixed during verification:
1. **Self-overwrite**: multer saved uploads onto `input/<deck>.pdf` while the
   client was still reading that file to send it → source truncated and deleted
   by multer cleanup. Fix: save to `input/.uploads/`, `renameSync` after the body
   is complete. `input/AAPLecture1…pdf` and `input/AAPLecture2…pdf` were destroyed
   by this and restored from copies in `Downloads/`.
2. **Piped stdin hang**: `spawn(..., { shell: true })` gave `opencode run` an open
   stdin pipe → it waited for EOF forever (session never created). Fix:
   `stdio: ['ignore', 'pipe', 'pipe']`.
3. **Timeout**: first E2E died at 10 min; observed full pipeline ≈ 23 min earlier
   the same day → raised to 30 min and write child output to `server/last-run.log`.

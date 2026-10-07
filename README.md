# ConceptCraft

Turn course slide decks into a structured summary and a concept map, in one clean pass.

## What it does
Reads a lecture PDF, summarizes it per topic, has a reviewer sub-agent check the
summary against the slide text, then renders a Mermaid concept map as SVG.

## Planning
See PLAN.md (made in OpenCode Plan mode). Key choices:
- Per-topic summaries instead of per-slide, so the recap is short and readable
- A flowchart concept map (max 12 nodes), which fits a pipeline like RAG
- A ready-made PDF MCP server instead of custom code
- One pass only: extract -> summarize -> review -> render

## Components
- **Harness:** OpenCode
- **MCP servers:** `pdf-reader` (@johangorter/mcp-pdf-server) extracts slide text; `mermaid` (mcp-mermaid) renders the diagram to SVG
- **Sub-agents** (`.opencode/agents/`): `summarizer` writes the recap; `reviewer` checks it against the slide text for missed concepts, errors, and diagram faithfulness
- **Skill** (`.opencode/skills/slide-recap/`): fixed recap format (key concepts, topic summaries, concept map, open questions), reusable on any deck

## How to run
1. Install OpenCode: `npm i -g opencode-ai`
2. Put a lecture PDF in `input/`
3. Run `opencode` in this folder (Build mode) and paste the prompt from RUN.md

## Web UI
- `npm run dev:server` — Express API on http://localhost:3001
- `npm run dev:client` — Vite app on http://localhost:5173 (proxies `/api`)
- Sidebar lists recaps from `output/`; the viewer renders Markdown with live Mermaid
  and the static concept map (SVG or PNG); uploading a PDF runs `opencode run`
  server-side and returns the new recap in about a minute. Plan in PLAN-FRONTEND.md.

## Example run
Input: `AAPLecture5_RAG_Fundamentals.pdf`
Output (in `output/`): the recap `.md` and the concept map `.svg`.
The reviewer failed the first draft with 3 fixes (an unsupported dependency in the
map, wrong nesting, reversed slide order). All were applied.

## Notes
The mermaid MCP timed out at startup in the session, so the agent called the server
directly over stdio. The diagram was still rendered by the mermaid MCP server.

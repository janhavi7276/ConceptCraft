# ConceptCraft — Plan

Single pass per deck: extract → summarize → review → render.

## MCP servers (1)
- `opencode.json` → local MCP `pdf`: ["npx","-y","@johangorter/mcp-pdf-server","."], timeout 30000.
- One tool: `extract_pdf_text` (unpdf, sandboxed to project folder).
- Fallback if flaky: `mcp-pdf-server` with `extract-text --working-directory .`.
- Verify: `opencode mcp list` shows pdf connected; restart session to load tools.

## Sub-agents (1)
- `task` reviewer (read-only): cross-checks draft recap vs extracted text —
  flags unsupported claims, slide-level filler, missing key topics. Main agent applies fixes.

## Skill (1)
- `.opencode/skill/slide-recap/SKILL.md`, frontmatter `name: slide-recap` + description,
  body = the 4-step procedure and output rules.
- Fallback: docs specify `.opencode/skills/` — move if not discovered by the `skill` tool.

## File layout
    opencode.json                          # pdf MCP registration
    .opencode/skill/slide-recap/SKILL.md   # workflow definition
    input/*.pdf                            # 5 decks, 18-34 pp, text layers present
    output/<LectureN_Slug>.md              # summary + embedded ```mermaid```
    output/<LectureN_Slug>.mmd             # standalone concept map

## Run steps
1. Write `opencode.json`, pre-warm npx cache, confirm MCP, restart session.
2. Per deck: `pdf_extract_pdf_text` on `input/*.pdf`; stop and report if near-empty (image-only).
3. Summarize per-topic: 3-6 topics x 2-4 bullets, 1-2 sentence overview, 3 key takeaways.
   (Not per-slide — too noisy for a recap.)
4. Review via reviewer sub-agent; apply fixes in place.
5. Render Mermaid `flowchart LR`: deck root, subgraph per topic, labeled cross-topic edges.
   (Not `mindmap` — no labeled edges.)
6. Write `.md` + `.mmd` to `output/`; verify 5 pairs, balanced fences,
   alphanumeric node IDs, quoted labels (no bare `( ) # ;`).

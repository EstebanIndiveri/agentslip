# Adding an agent

v0.1 supports Claude Code and Codex. Cursor, Gemini CLI, and opencode are out of scope.

To add an agent:

1. Read that agent's official hook documentation. Record the URL and fetch date.
2. Add JSON fixtures under `fixtures/<agent>/` with a sibling `*.manifest.json` that lists:
   - `source` (doc URL)
   - `verified_fields` (present in the official examples or tables)
   - `assumed_fields` (needed to render a ticket but not documented)
3. Add `src/hooks/<agent>.ts` that maps events to slip kinds (`done` / `needs-you` / `session`).
4. Teach `detectAgent` / `parseHook` how to recognize the payload.
5. Add parser tests. Do not invent tokens, cost, duration, or summaries.

Transcript files are **best effort** unless the vendor documents the format.

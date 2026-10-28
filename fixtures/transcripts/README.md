# Transcript fixtures (best effort)

Official hook docs expose `transcript_path` but **do not document the file format**.

Claude Code (https://code.claude.com/docs/en/hooks, fetched 2026-10-28): `transcript_path` is "Path to conversation JSON" and examples use a `.jsonl` path. They recommend `last_assistant_message` on Stop instead of reading the transcript.

Codex (https://learn.chatgpt.com/docs/hooks, fetched 2026-10-28): "the transcript format isn’t a stable interface for hooks and may change over time."

`claude-session.jsonl` is an **assumed** JSONL shape used only to test optional duration / turn / tool / token extraction. Token counts are copied from invented `usage` objects in this fixture; cost is omitted on purpose so the slip prints `n/a` rather than an estimate.

If the file is larger than 256 KB, only the last 256 KB is read. Counts from that tail are **not** printed as session totals; duration / turns / tools / tokens / cost are `n/a`. `lastAssistant` may still come from the tail.

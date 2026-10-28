/** Built-in example payloads for `agentslip test` / `npm run demo`. */

export const exampleDone = {
  session_id: "abc123",
  prompt_id: "550e8400-e29b-41d4-a716-446655440000",
  transcript_path: "/home/user/.claude/projects/demo/transcript.jsonl",
  cwd: "/home/user/demo-app",
  permission_mode: "default",
  hook_event_name: "Stop",
  stop_hook_active: false,
  last_assistant_message: "I've completed the refactoring. Here's a summary of the changes.",
  background_tasks: [],
  session_crons: [],
};

export const exampleNeedsYou = {
  session_id: "abc123",
  transcript_path: "/home/user/.claude/projects/demo/transcript.jsonl",
  cwd: "/home/user/demo-app",
  permission_mode: "default",
  hook_event_name: "PermissionRequest",
  tool_name: "Bash",
  tool_input: {
    command: "rm -rf node_modules",
    description: "Remove node_modules directory",
  },
};

export const exampleSession = {
  session_id: "abc123",
  transcript_path: "/home/user/.claude/projects/demo/transcript.jsonl",
  cwd: "/home/user/demo-app",
  hook_event_name: "SessionEnd",
  reason: "other",
};

export const examples = [exampleDone, exampleNeedsYou, exampleSession];

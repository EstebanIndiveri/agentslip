import { execFileSync } from "node:child_process";

export type GitInfo = {
  repo?: string;
  branch?: string;
  shortstat?: string;
};

export function gitInfo(cwd?: string): GitInfo {
  const envRepo = process.env.AGENTSLIP_GIT_REPO;
  const envBranch = process.env.AGENTSLIP_GIT_BRANCH;
  const envStat = process.env.AGENTSLIP_GIT_SHORTSTAT;
  if (envRepo !== undefined || envBranch !== undefined || envStat !== undefined) {
    return {
      repo: emptyToUndef(envRepo),
      branch: emptyToUndef(envBranch),
      shortstat: emptyToUndef(envStat),
    };
  }
  const dir = cwd || process.cwd();
  try {
    const top = run(dir, ["rev-parse", "--show-toplevel"]);
    const repo = top.split(/[/\\]/).filter(Boolean).pop();
    const branch = run(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
    let shortstat: string | undefined;
    try {
      shortstat = run(dir, ["diff", "--shortstat"]) || undefined;
    } catch {
      shortstat = undefined;
    }
    return { repo, branch, shortstat };
  } catch {
    return {};
  }
}

function run(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 400,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function emptyToUndef(s: string | undefined): string | undefined {
  if (s === undefined || s === "") return undefined;
  return s;
}

/** `1 file changed, 3 insertions(+)` → `1 file, +3 -0`. Unknown shapes pass through. */
export function compactShortstat(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  const files = t.match(/(\d+) files? changed/i);
  if (!files) return t;
  const n = files[1];
  const fileWord = n === "1" ? "file" : "files";
  const ins = t.match(/(\d+) insertions?/i);
  const del = t.match(/(\d+) deletions?/i);
  return `${n} ${fileWord}, +${ins?.[1] ?? "0"} -${del?.[1] ?? "0"}`;
}

/** Word-wrap to `width` columns. Overlong tokens are truncated with "…". */

export function wrapLine(text: string, width: number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  if (width < 2) return ["…"];
  const words = normalized.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const raw of words) {
    const word = raw.length > width ? `${raw.slice(0, width - 1)}…` : raw;
    if (!cur) {
      cur = word;
      continue;
    }
    if (`${cur} ${word}`.length <= width) {
      cur = `${cur} ${word}`;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function oneLine(text: string, width: number): string {
  const lines = wrapLine(text, width);
  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0];
  const first = wrapLine(text, width)[0];
  if (first.length >= width) return `${first.slice(0, width - 1)}…`;
  return first;
}

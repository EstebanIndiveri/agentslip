/** Escape ReceiptLine special characters in untrusted text. */

const SPECIAL = /[\\|{}~\-_"`^=]/g;

export function escapeRl(text: string): string {
  return text.replace(SPECIAL, (ch) => `\\${ch}`);
}

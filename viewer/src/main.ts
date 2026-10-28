type SlipItem = {
  file: string;
  kind: string;
  agent: string;
  ticketNo: number;
  sessionCode: string;
  createdAt: string;
  url: string;
};

const roll = document.getElementById("roll") as HTMLElement;
const empty = document.getElementById("empty") as HTMLElement;
let items: SlipItem[] = [];
let selected = 0;
const seen = new Set<string>();

async function load(): Promise<void> {
  const res = await fetch("/api/slips", { cache: "no-store" });
  if (!res.ok) return;
  items = (await res.json()) as SlipItem[];
  render(false);
}

function render(animateNew: boolean): void {
  empty.hidden = items.length > 0;
  const currentFiles = new Set(items.map((i) => i.file));
  for (const el of [...roll.children]) {
    const f = (el as HTMLElement).dataset.file;
    if (f && !currentFiles.has(f)) el.remove();
  }
  items.forEach((item, index) => {
    let el = roll.querySelector(`[data-file="${cssEscape(item.file)}"]`) as HTMLElement | null;
    const isNew = !seen.has(item.file);
    if (!el) {
      el = document.createElement("article");
      el.className = "slip";
      el.tabIndex = -1;
      el.dataset.file = item.file;
      el.setAttribute("role", "listitem");
      const obj = document.createElement("object");
      obj.type = "image/svg+xml";
      obj.data = item.url;
      obj.setAttribute("aria-label", `Ticket ${item.ticketNo} ${item.kind}`);
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = `<span>#${item.ticketNo} ${item.kind}</span><span>${item.agent}</span>`;
      el.append(obj, meta);
      el.addEventListener("click", () => select(index, true));
      if (animateNew && isNew) el.style.animation = "emerge 0.55s ease-out";
      const before = roll.children[index];
      if (before) roll.insertBefore(el, before);
      else roll.append(el);
    }
    seen.add(item.file);
    el.setAttribute("aria-selected", index === selected ? "true" : "false");
  });
  if (selected >= items.length) selected = Math.max(0, items.length - 1);
}

function cssEscape(s: string): string {
  return s.replace(/"/g, '\\"');
}

function select(index: number, focus: boolean): void {
  if (items.length === 0) return;
  selected = Math.max(0, Math.min(items.length - 1, index));
  render(false);
  const el = roll.querySelectorAll<HTMLElement>(".slip")[selected];
  if (focus && el) el.focus();
}

function downloadSelected(): void {
  const item = items[selected];
  if (!item) return;
  const a = document.createElement("a");
  a.href = item.url;
  a.download = item.file;
  a.click();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    select(selected + 1, true);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    select(selected - 1, true);
  } else if (e.key === "Home") {
    e.preventDefault();
    select(0, true);
  } else if (e.key === "End") {
    e.preventDefault();
    select(items.length - 1, true);
  } else if (e.key === "d" || e.key === "D") {
    e.preventDefault();
    downloadSelected();
  }
});

void load();
setInterval(() => {
  void load();
}, 1000);

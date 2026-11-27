// No Herdr imports: usage-data.test.mjs runs this with node.

// A block of a layout tree by its id.
export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export const snapshot = (spaces, focus, layout, sidebar = true) => ({
  layout,
  sidebar,
  space: focus?.space ?? null,
  tab: focus?.tab ?? null,
  pane: focus?.pane ?? null,
  spaces: Object.fromEntries(spaces.map((s) => [s.id, {
    name: s.named ? s.name : null,
    tabs: s.tabs.map((t) => ({ id: t.id, name: t.named ? t.name : null, panes: t.panes, zoomed: t.zoomed, settled: t.settled })),
  }])),
});

// Every name changes() logs.
export const STATE = ["space.new", "space.close", "space.rename", "space.select", "tab.new", "tab.close", "tab.move", "tab.rename", "tab.settle", "tab.select",
  "pane.split", "pane.close", "pane.zoom", "pane.go", "layout.switch", "layout.toggle:sidebar"];

// More new or gone spaces than this at once is the app starting or a machine (dis)connecting.
const BURST = 2;

// Herdr commands that explain the change from snapshot a to b. No mod sees Herdr's own keys, so this is how they are counted.
export function changes(a, b) {
  const out = [];
  const add = (f, n = 1) => { for (let i = 0; i < n; i++) out.push(f); };
  const born = Object.keys(b.spaces).filter((id) => !a.spaces[id]);
  const gone = Object.keys(a.spaces).filter((id) => !b.spaces[id]);
  if (born.length <= BURST) add("space.new", born.length);
  if (gone.length <= BURST) add("space.close", gone.length);
  for (const [id, now] of Object.entries(b.spaces)) {
    const was = a.spaces[id];
    if (!was) continue;
    if (now.name && now.name !== was.name) add("space.rename");
    const before = new Map(was.tabs.map((t) => [t.id, t]));
    const after = new Set(now.tabs.map((t) => t.id));
    add("tab.new", now.tabs.filter((t) => !before.has(t.id)).length);
    add("tab.close", was.tabs.filter((t) => !after.has(t.id)).length);
    const order = (tabs, other) => tabs.map((t) => t.id).filter((x) => other.has(x)).join();
    if (order(was.tabs, after) !== order(now.tabs, before)) add("tab.move");
    for (const t of now.tabs) {
      const p = before.get(t.id);
      if (!p) continue;
      if (t.panes > p.panes) add("pane.split", t.panes - p.panes);
      if (t.panes < p.panes) add("pane.close", p.panes - t.panes);
      if (t.zoomed && !p.zoomed) add("pane.zoom");
      if (t.settled && !p.settled) add("tab.settle");
      if (t.name && t.name !== p.name) add("tab.rename");
    }
  }
  if (a.layout !== b.layout) add("layout.switch");
  else if (a.sidebar !== b.sidebar) add("layout.toggle:sidebar");
  // A new space, tab or pane takes the focus: that is not a move of its own.
  if (!out.length) {
    if (b.space && a.space !== b.space) add("space.select");
    else if (b.tab && a.tab !== b.tab) add("tab.select");
    else if (b.pane && a.pane !== b.pane) add("pane.go");
  }
  return out;
}

const DAY = 864e5;

// Every usage window: tips, their repeat and the report.
export const WINDOW = 7 * DAY;

// A use of feature f counts for id: the same, or inside it (mh-spaces.board.jira.n is a use of mh-spaces.board).
export const covers = (id, f) => f === id || f.startsWith(`${id}.`);

// The first tip whose feature had no use and no tip in the last WINDOW. log: parsed log lines; shown: { f: "YYYY-MM-DD" }.
export function nextTip(tips, log, shown, now) {
  const used = new Set(log.filter((l) => l.via !== "tip" && now - Date.parse(l.t) < WINDOW).map((l) => l.f));
  const fresh = (f) => !shown[f] || now - Date.parse(shown[f]) >= WINDOW;
  return tips.find((x) => fresh(x.f) && ![...used].some((f) => covers(x.f, f))) ?? null;
}

export const parseLog = (text) => text.split("\n").flatMap((l) => { try { return l ? [JSON.parse(l)] : []; } catch { return []; } });

// This month's and last month's log files.
export function logFiles(now) {
  const d = new Date(now);
  const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return [prev, d].map((x) => `${x.toISOString().slice(0, 7)}.jsonl`);
}

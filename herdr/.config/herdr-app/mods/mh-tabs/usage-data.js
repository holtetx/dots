// No Herdr imports: usage-data.test.mjs runs this with node.

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Focus moves are left out: mh-* keys and clicks cause most of them, so they would credit Herdr's keys falsely.
export const snapshot = (spaces, layout, sidebar = true) => ({
  layout,
  sidebar,
  spaces: Object.fromEntries(spaces.map((s) => [s.id, {
    // A remote space comes and goes with its machine's connection.
    here: !s.machine,
    name: s.named ? s.name : null,
    tabs: s.tabs.map((t) => ({ id: t.id, name: t.named ? t.name : null, panes: t.panes, zoomed: t.zoomed, settled: t.settled })),
  }])),
});

export const STATE = ["space.new", "space.close", "space.rename", "tab.new", "tab.close", "tab.move", "tab.rename", "tab.settle",
  "pane.split", "pane.close", "pane.zoom", "layout.switch", "layout.toggle:sidebar"];

// More new or gone spaces than this at once is the app starting.
const BURST = 2;

// No mod sees Herdr's own keys: their use shows only as a change from snapshot a to b.
export function changes(a, b) {
  const out = [];
  const add = (f, n = 1) => { for (let i = 0; i < n; i++) out.push(f); };
  const born = Object.keys(b.spaces).filter((id) => !a.spaces[id] && b.spaces[id].here);
  const gone = Object.keys(a.spaces).filter((id) => !b.spaces[id] && a.spaces[id].here);
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
  return out;
}

const DAY = 864e5;
export const WINDOW = 7 * DAY;

// A use of feature f counts for id: the same, or inside it (mh-spaces.board.jira.n is a use of mh-spaces.board).
export const covers = (id, f) => f === id || f.startsWith(`${id}.`);

// The first tip whose feature had no use and no tip in WINDOW. shown: { f: "YYYY-MM-DD" }.
export function nextTip(tips, log, shown, now) {
  const used = new Set(log.filter((l) => l.via !== "tip" && now - Date.parse(l.t) < WINDOW).map((l) => l.f));
  const fresh = (f) => !shown[f] || now - Date.parse(shown[f]) >= WINDOW;
  return tips.find((x) => fresh(x.f) && ![...used].some((f) => covers(x.f, f))) ?? null;
}

export const parseLog = (text) => text.split("\n").flatMap((l) => { try { return l ? [JSON.parse(l)] : []; } catch { return []; } });

// One file a day keeps each read far under readTextFile's 1 MiB. One more day than WINDOW: days are UTC.
export const logFiles = (now) => Array.from({ length: 8 }, (_, i) => `${new Date(now - i * DAY).toISOString().slice(0, 10)}.jsonl`);

export const srcOf = (f) => (f.startsWith("mh-") ? "mh" : "herdr");

// An action as keys.json has it, or as keys() gives it (an object action as JSON text).
export function featureOf(action) {
  const a = typeof action !== "string" ? action.command : action.startsWith("{") ? JSON.parse(action).command : action;
  if (a.startsWith("send:") || a === "terminal") return null;
  if (a.startsWith("mod.open:")) return a.slice(9);
  if (a.startsWith("mh-") || STATE.includes(a)) return a;
  const name = a.split(":")[0];
  return STATE.includes(name) ? name : null;
}

// An esc this soon after a dialog opens, with nothing between: opened by mistake, or not what was wanted.
const QUICK = 5000;

// Per dialog: its opens, and how many an esc closed within QUICK with nothing between. uses: sorted by time, no tips.
export function quickOf(uses) {
  const quick = {};
  uses.forEach((l, i) => {
    if (l.via !== "open") return;
    const area = l.f.replace(/\.open$/, "");
    const q = (quick[area] ??= { opens: 0, esc: 0 });
    q.opens++;
    const next = uses[i + 1];
    if (next?.via === "key" && next.f.endsWith(".escape") && covers(area, next.f) && Date.parse(next.t) - Date.parse(l.t) < QUICK) q.esc++;
  });
  return quick;
}

export function summarize(log, keys, tips, now) {
  const since = now - WINDOW;
  const recent = log.filter((l) => Date.parse(l.t) >= since).sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const uses = recent.filter((l) => l.via !== "tip");
  const by = new Map();
  for (const l of uses) {
    const x = by.get(l.f) ?? { f: l.f, src: srcOf(l.f), n: 0, last: l.t, via: {} };
    x.n++;
    x.last = l.t;
    x.via[l.via] = (x.via[l.via] ?? 0) + 1;
    by.set(l.f, x);
  }
  const rows = [...by.values()].sort((a, b) => b.n - a.n);
  const bindings = Object.values(keys).flatMap((section) => Object.entries(section));
  const ids = new Set([...bindings.map(([, a]) => featureOf(a)).filter(Boolean), ...tips.map((x) => x.f)]);
  const never = [...ids].filter((id) => !uses.some((l) => covers(id, l.f))).sort();
  const unlogged = bindings.filter(([, a]) => featureOf(a) === null).map(([k, a]) => `${k}: ${typeof a === "string" ? a : JSON.stringify(a)}`);
  const quick = quickOf(uses);
  const tipped = recent.filter((l) => l.via === "tip").map((l) => ({ f: l.f, shown: l.t, used: uses.some((u) => covers(l.f, u.f) && u.t > l.t) }));
  return { from: new Date(since).toISOString().slice(0, 10), events: uses.length, rows, never, unlogged, quick, tipped };
}

// Keys come from keys() so the list follows keys.json; see "Key list" in the herdr CLAUDE.md.
// With props { usage: true } (ctrl-a u) each key also shows its uses in the last 7 days, from the usage log.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { keys, commands, props, closeOverlay, theme, window, shared, appHome, readTextFile } from "herdr";
import { action, frame } from "./pixel.js";
import { LOG_DIR, track, trackKey } from "./stats.js";
import { STATE, WINDOW, covers, featureOf, logFiles, parseLog, quickOf } from "./usage-data.js";

const SESSIONS = "Sessions";
const SPACES = "Spaces and tabs";
const PANES = "Panes";
const COPY = "Copy and hints";
const BOARD = "Board and links";
const APP = "App";
const TERMINAL = "In a terminal";
const OPEN = "In the open dialog (cmd-o)";
const OTHER = "Other";
const ORDER = [SESSIONS, SPACES, PANES, COPY, BOARD, APP, TERMINAL, OPEN, OTHER];

// By action, or by "section|action" outside the global section. # is 1-9, * a direction.
const DESCRIBE = {
  "mod.open:mh-sessions": [SESSIONS, "Search sessions: running, Waiting and ended ones"],
  "mh-tabs.new-session": [SESSIONS, "New space with a Claude session, in a folder you pick"],
  '{"command":"tab.new","args":{"name":"Claude","argv":["claude","--worktree"]}}': [SESSIONS, "New tab with a Claude session in its own worktree"],
  "mh-tabs.agent-next": [SESSIONS, "Next agent, in sidebar order"],
  "mh-tabs.agent-prev": [SESSIONS, "Previous agent"],
  "mh-tabs.wait": [SESSIONS, "Put the space in Waiting, or take it out"],
  "mh-tabs.waiting": [SESSIONS, "Show or hide the Waiting section"],
  "mod.open:mh-picker": [SESSIONS, "Go to a tab"],
  "mh-tabs.usage": [APP, "Usage: what I use in Herdr, live, last 7 days"],
  "mh-tabs.test-toast": [APP, "Show a sample toast; again for the next kind"],
  "mod.open:mh-open": [SESSIONS, "Open a recent folder as a space, tab or pane"],
  "mod.open:mh-ssh": [SESSIONS, "SSH to a host: a space with ssh and a Claude session beside it"],

  "space.new": [SPACES, "New space"],
  "space.rename": [SPACES, "Rename the space"],
  "mh-tabs.space-next": [SPACES, "Next space, in sidebar order"],
  "mh-tabs.space-prev": [SPACES, "Previous space"],
  "mh-tabs.space-#": [SPACES, "Go to space 1-9"],
  "tab.new": [SPACES, "New tab"],
  "tab.close": [SPACES, "Close the tab"],
  "tab.rename": [SPACES, "Rename the tab"],
  "tab.next": [SPACES, "Next tab"],
  "tab.prev": [SPACES, "Previous tab"],
  "tab.select:#": [SPACES, "Go to tab 1-9"],
  '{"command":"tab.move","args":{"by":-1}}': [SPACES, "Move the tab left"],
  '{"command":"tab.move","args":{"by":1}}': [SPACES, "Move the tab right"],
  "mh-tabs.new-window": [SPACES, "New window onto the same spaces"],

  "pane.split:right": [PANES, "Split to the right"],
  "pane.split:down": [PANES, "Split down"],
  "pane.close": [PANES, "Close the pane"],
  "pane.zoom": [PANES, "Zoom the pane, or show all panes again"],
  "pane.go:*": [PANES, "Go to the pane in that direction"],
  "pane.swap:*": [PANES, "Swap with the pane in that direction"],
  "pane.resize:*": [PANES, "Move the pane's border in that direction"],
  "layout.switch": [PANES, "Next layout"],
  "layout.toggle:sidebar": [PANES, "Show or hide the sidebar"],

  "mh-tabs.copy-mode": [COPY, "Copy mode: vim keys over the screen and history"],
  "mh-tabs.fingers": [COPY, "Hints: copy a hash, path or URL from the screen"],
  "mod.open:mh-scroll": [COPY, "Scroll mode: vim keys scroll the terminal"],
  "send:\u0001": [COPY, "Send ctrl-a to the program"],

  "mh-tabs.tasks": [BOARD, "Tasks: the PRs and issues of my sessions"],
  "mh-tabs.board": [BOARD, "Board: open PRs and issues of my repos"],
  "mh-tabs.pr": [BOARD, "The space's PR: status and CI checks, in the side panel"],
  "mh-tabs.link": [BOARD, "Link a PR or issue to the focused agent"],
  "mh-tabs.link-space": [BOARD, "Link a PR or issue to the space"],

  "mod.open:mh-lunch": [OTHER, "This week's canteen lunch, today highlighted"],

  "app.palette": [APP, "Command palette"],
  "app.settings": [APP, "Settings"],
  "mod.open:mh-help": [APP, "My keys (this list)"],
  "app.help": [APP, "Herdr's raw key list"],
  "app.zoom_in": [APP, "Zoom in"],
  "app.zoom_out": [APP, "Zoom out"],
  "app.zoom_reset": [APP, "Reset zoom"],
  "window.minimize": [APP, "Minimize the window"],
  "app.hide": [APP, "Hide Herdr"],
  "app.hide_others": [APP, "Hide the other apps"],
  "app.quit": [APP, "Quit Herdr"],
  "app.reset": [APP, "Escape hatch: reset the layout and keys"],

  "terminal|terminal.search": [TERMINAL, "Find in the terminal"],
  "terminal|terminal.select_all": [TERMINAL, "Select all"],
  "terminal|terminal.copy": [TERMINAL, "Copy the selection"],
  "terminal|terminal.paste": [TERMINAL, "Paste"],
  "terminal|terminal.paste_image": [TERMINAL, "Paste the clipboard image as a file"],
  "terminal|send:\u001bb": [TERMINAL, "Word left"],
  "terminal|send:\u001bf": [TERMINAL, "Word right"],
  "terminal|send:\u0017": [TERMINAL, "Delete the word to the left"],
  "terminal|send:\u0001": [TERMINAL, "Start of the line"],
  "terminal|send:\u0005": [TERMINAL, "End of the line"],
  "terminal|send:\u0015": [TERMINAL, "Delete to the start of the line"],

  "mod:mh-open|mh-open.claude": [OPEN, "Start Claude there, in a new space"],
  "mod:mh-open|mh-open.claude-worktree": [OPEN, "Start Claude there, in its own worktree"],
};
const RANK = Object.fromEntries(Object.keys(DESCRIBE).map((k, i) => [k, i]));

// Object actions come as JSON text; compare them without spaces.
const norm = (action) => (action.startsWith("{") ? JSON.stringify(JSON.parse(action)) : action);
const DIRS = ["left", "down", "up", "right"];

// [row action, part]: tab.select:3 is ["tab.select:#", "3"], pane.go:up ["pane.go:*", "up"].
function fold(action) {
  const n = action.match(/^(tab\.select:|mh-tabs\.space-)([1-9])$/);
  if (n) return [`${n[1]}#`, n[2]];
  const d = action.match(/^(pane\.(?:go|swap|resize)):(left|down|up|right)$/);
  if (d) return [`${d[1]}:*`, d[2]];
  return [action, null];
}

function herdrWords(action, about) {
  if (action.startsWith("send:")) return `Type ${JSON.stringify(action.slice(5))}`;
  const name = action.startsWith("{") ? JSON.parse(action).command : action.split(":")[0];
  return about[name]?.split(/(?<=\.)\s/)[0] ?? action;
}

// Same symbols as mh-new-menu's shortcut() (mods can't import each other).
function strokes(text) {
  const mac = window()?.platform === "macos";
  const names = mac ? { ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘" } : { ctrl: "Ctrl+", alt: "Alt+", shift: "Shift+", cmd: "Super+" };
  const arrows = { left: "←", right: "→", up: "↑", down: "↓", enter: "↵", tab: "⇥", backspace: "⌫", escape: "Esc" };
  return text.trim().split(/\s+/).map((stroke) => {
    const parts = stroke.split("-");
    let key = parts.pop();
    if (key === "") (key = "-"), parts.pop();
    const held = new Set(parts);
    const label = arrows[key] ?? (key.length === 1 ? key : key[0].toUpperCase() + key.slice(1));
    return { mods: Object.keys(names).filter((m) => held.has(m)).map((m) => names[m]).join(""), key: label };
  });
}

// One row's keys: "⌘t", "⌃a ⇧t", or folded ones as "⌘ 1-9" and "⌥ hjkl".
function keyText(bindings) {
  const shown = [];
  const folded = new Map();
  for (const b of bindings) {
    const s = strokes(b.keys);
    const last = s.pop();
    const head = [...s.map((x) => x.mods + x.key), last.mods].filter(Boolean).join(" ");
    if (!b.part) shown.push(`${head}${head && !last.mods ? " " : ""}${last.key}`);
    else (folded.get(head) ?? folded.set(head, []).get(head)).push({ ...b, key: last.key });
  }
  for (const [head, list] of folded) {
    list.sort((a, b) => (DIRS.indexOf(a.part) - DIRS.indexOf(b.part)) || a.part.localeCompare(b.part));
    const keys = list.map((x) => x.key);
    const run = list.length > 2 && list.every((x, i) => /^\d$/.test(x.part) && Number(x.part) === Number(list[0].part) + i);
    shown.push(`${head} ${run ? `${keys[0]}-${keys.at(-1)}` : keys.join("")}`);
  }
  return shown.join("  ·  ");
}

// "ctrl-a" must not match inside "ctrl-alt".
const rawHit = (raw, f) => raw.toLowerCase().split(f).slice(1).some((after) => /[- ]$/.test(f) || !/^[a-z0-9]/.test(after));

function rows() {
  const about = Object.fromEntries(commands().map((c) => [c.name, c.about]));
  const byRow = new Map();
  for (const k of keys()) {
    if (!k.keys.trim()) continue;
    if (k.action === "mod.open:mh-lunch" && !shared("mh-lunch")) continue; // no canteen on this Mac
    const [action, part] = fold(norm(k.action));
    const id = k.section === "global" ? action : `${k.section}|${action}`;
    const row = byRow.get(id) ?? byRow.set(id, { id, section: k.section, action, bindings: [], actions: [] }).get(id);
    row.bindings.push({ keys: k.keys, part });
    row.actions.push(norm(k.action));
  }
  return [...byRow.values()].map((r) => {
    const known = DESCRIBE[r.id];
    const group = known?.[0] ?? (r.section === "terminal" ? TERMINAL : r.section === "global" ? OTHER : `In ${r.section.replace(/^mod:/, "")}`);
    return { group, words: known?.[1] ?? herdrWords(r.action, about), unknown: !known, keys: keyText(r.bindings), raw: r.bindings.map((b) => b.keys).join(" "), rank: RANK[r.id] ?? Infinity, actions: r.actions };
  });
}

// The usage view leaves out macOS and terminal defaults: they say nothing about how Herdr and the mh-* mods are used.
const OBVIOUS = new Set(["app.quit", "app.hide", "app.hide_others", "window.minimize", "app.zoom_in", "app.zoom_out", "app.zoom_reset", "app.settings", "send:\u0001"]);
const obvious = (r) => r.group === TERMINAL || r.actions.every((a) => OBVIOUS.has(a));

// The dialog a key opens, where that dialog logs its own keys: the key's command and the dialog log under different names.
const AREA = { "mh-tabs.board": "mh-spaces.board", "mh-tabs.tasks": "mh-sessions.tasks", "mh-tabs.link": "mh-spaces.link", "mh-tabs.copy-mode": "mh-copy.copy", "mod.open:mh-sessions": "mh-sessions.search", "mh-tabs.usage": "mh-usage" };
const areaOf = (a) => AREA[a] ?? (a.startsWith("mod.open:") ? a.slice(9) : null);

// Uses per feature, by how they were seen; made once per log read, so render does no work per log line.
function countLog(log) {
  const by = { open: new Map(), key: new Map(), state: new Map(), other: new Map() };
  for (const l of log) {
    const m = by[l.via] ?? by.other;
    m.set(l.f, (m.get(l.f) ?? 0) + 1);
  }
  return by;
}

// A row's key presses (an opened dialog for mod.open), or null when no mod sees them. A row has an action once per key bound to it.
function usesOf(actions, by) {
  let n = null;
  for (const a of new Set(actions)) {
    const f = featureOf(a);
    if (!f) continue;
    const area = areaOf(a);
    n = (n ?? 0) + (a.startsWith("mod.open:") ? (by.open.get(area) ?? 0) + (by.open.get(`${area}.open`) ?? 0) : (by.key.get(f) ?? 0) + (by.state.get(f) ?? 0));
  }
  return n;
}

// Herdr's own commands are counted from what changed, so other keys and clicks count too.
const fromState = (actions) => actions.some((a) => STATE.includes(featureOf(a)));

const byUses = (m) => [...m].sort((a, b) => b[1] - a[1]);

// Keys pressed inside the row's dialog, as sub-rows.
const inside = (area, by, tips) => byUses(by.key).filter(([f]) => f !== area && covers(area, f)).map(([f, uses]) => {
  const parts = f.slice(area.length + 1).split(".");
  const key = parts.pop();
  return { keys: keyText([{ keys: key }]), words: tips.get(f) ?? ((key === "escape" ? "close" : "") + (parts.length ? ` on the ${parts.join(" ")} tab` : "")).trim(), uses };
});

// Clicks, drags, finished actions and dialogs no key opens: no row of their own, so they get one here. shown(f): a key row has it.
const others = (by, shown) => byUses(new Map([...by.other, ...[...by.open, ...by.key, ...by.state].filter(([f]) => !shown(f))]))
  .map(([f, uses]) => ({ group: "Without a key", keys: "", words: f.replace(/^mh-[a-z-]+\./, "").split(".").join(" · ").replace(/-/g, " "), uses, rank: 0, sub: [] }));

export default class Help extends View {
  init(_props, cx) {
    this.usage = Boolean(props()?.usage);
    this.area = this.usage ? "mh-usage" : "mh-help";
    track(`${this.area}.open`, "open");
    this.by = countLog([]);
    this.quick = {};
    this.total = 0;
    if (this.usage) {
      const poll = (cx) => cx.spawn((cx) => this.load(cx));
      poll(cx);
      cx.timer.every(2000, poll);
    }
    this.filter = "";
    this.input = InputState.new({ placeholder: "Type to filter…" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); cx.notify(); });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  async load(cx) {
    if (!this.tips) {
      try { this.tips = new Map(JSON.parse(await readTextFile(`${appHome()}/mods/mh-tabs/tips.json`)).map((x) => [x.f, x.text])); } catch { this.tips = new Map(); }
    }
    const now = Date.now();
    const text = (await Promise.all(logFiles(now).map((f) => readTextFile(`${LOG_DIR()}/${f}`).catch(() => null)))).filter(Boolean).join("\n");
    if (text !== this.text) this.all = parseLog(text).filter((l) => l.via !== "tip").sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
    const uses = this.all.filter((l) => now - Date.parse(l.t) < WINDOW);
    if (text === this.text && uses.length === this.total) return;
    this.text = text;
    this.total = uses.length;
    this.by = countLog(uses);
    this.quick = quickOf(uses);
    cx.notify();
  }

  render(cx) {
    const t = theme();
    const f = this.filter.toLowerCase();
    const hit = (r) => !f || r.keys.toLowerCase().includes(f) || (r.raw && rawHit(r.raw, f)) || r.words.toLowerCase().includes(f) || r.group.toLowerCase().includes(f);
    let all = rows();
    if (this.usage) {
      all = all.filter((r) => !obvious(r)).map((r) => {
        const area = r.actions.map(areaOf).find(Boolean);
        return { ...r, uses: usesOf(r.actions, this.by), state: fromState(r.actions), area, features: r.actions.map(featureOf), quick: area && this.quick[area], sub: area ? inside(area, this.by, this.tips) : [] };
      });
      const keyed = all;
      all.push(...others(this.by, (f) => keyed.some((r) => r.features.includes(f) || (r.area && covers(r.area, f)))));
    }
    all = all.filter(hit);
    const names = [...ORDER, ...new Set(all.map((r) => r.group).filter((g) => !ORDER.includes(g)))];
    const order = (a, b) => (b.uses ?? -1) - (a.uses ?? -1) || a.rank - b.rank;
    const groups = names.map((g) => [g, all.filter((r) => r.group === g).sort(order)]).filter(([, list]) => list.length);
    const max = Math.max(1, ...all.map((r) => r.uses ?? 0));
    const shown = (r) => (r.uses === null ? ["n/a", "Not logged: no mod sees this key"]
      : r.state && r.uses ? [`~${r.uses}`, "Counted from what changed in Herdr, not from this key: other keys, clicks and the command's other forms (split right and down, move left and right) count too"]
      : [String(r.uses), null]);
    const count = (r, [n, tip] = shown(r)) => h_flex().flex_none().gap(8).items_center()
      .when(Boolean(r.quick?.esc), (el) => el.child(div().text_size(11).text_color(t.dim).child(`${r.quick.esc} of ${r.quick.opens} closed at once`)))
      .child(div().id(`n-${r.keys}-${r.words}`).w(40).text_size(12).text_color(r.uses ? t.foreground : t.dim).child(n).when(Boolean(tip), (el) => el.tooltip(tip)))
      .child(div().w(80).h(6).rounded(3).bg(t.raised).child(div().h_full().rounded(3).bg(t.accent).w(Math.round((80 * (r.uses ?? 0)) / max))));
    const line = (r, sub) => h_flex()
      .min_h(sub ? 24 : 30)
      .px(8)
      .gap(12)
      .rounded(6)
      .items_center()
      .when(this.usage && !r.uses, (el) => el.opacity(0.45))
      .child(div().w(230).flex_none().text_color(t.accent).child(sub ? `   └ ${r.keys}` : r.keys))
      .child(div().flex_1().min_w(0).text_color(sub ? t.muted : t.foreground).child(r.words))
      .when(Boolean(r.unknown) && !this.usage, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child("no description")))
      .when(this.usage, (el) => el.child(count(r)));
    return v_flex()
      .id("mh-help")
      .track_focus(this.handle)
      .on_key_down((e) => {
        trackKey(this.area, e, true);
        if (e.key === "escape") return closeOverlay(props().overlay);
      })
      .size_full()
      .min_h(0)
      .p(18)
      .gap(14)
      .bg(t.popover)
      .text_size(12)
      .child(
        h_flex()
          .h(22)
          .items_center()
          .justify_between()
          .child(h_flex().gap(8).items_center()
            .child(div().text_size(15).font_semibold().text_color(t.foreground).child(this.usage ? "USAGE" : "MY KEYS"))
            .when(this.usage, (el) => el.child(div().text_size(12).text_color(t.dim).child(`last 7 days · ${this.total} uses · live`))))
          .child(action(t, "mh-help-esc", "Esc", false, () => closeOverlay(props().overlay))),
      )
      .child(frame(Input.new(this.input), t.accent, t.background).flex_none().h(36).px(10).text_size(12.8).text_color(t.foreground))
      .child(
        v_flex()
          .id("mh-help-list")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .py(2)
          .gap(10)
          .children(
            groups.map(([name, list]) =>
              v_flex()
                .gap(2)
                .child(div().text_size(11.5).font_semibold().text_color(t.dim).child(name.toUpperCase()))
                .children(list.flatMap((r) => [line(r, false), ...(r.sub ?? []).map((s) => line(s, true))])),
            ),
          ),
      );
  }
}

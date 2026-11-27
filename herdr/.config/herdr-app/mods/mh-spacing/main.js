// Spacing dialog: pane gap, terminal padding and title bars (layout.set), plus the Hints, Links, Board and Sidebar tabs (saved by mh-footer).

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { layout, run, theme, props, closeOverlay, appHome, readTextFile, shared, setShared } from "herdr";
import { boardTab, boardTabInit, boardKey, check } from "./board-tab.js";
import { button, helpKey, keyPanel } from "./pixel.js";
import { track, trackKey } from "./stats.js";

const DEFAULT = { gap: 8, padX: 16, padY: 14 };
const ROWS = [
  { key: "gap", label: "Pane gap", max: 16 },
  { key: "padX", label: "Terminal padding, sides", max: 32 },
  { key: "padY", label: "Terminal padding, top and bottom", max: 32 },
];
const STEP = 2;
const BARS = [["always", "Shown"], ["hover", "On hover"], ["none", "Hidden"]];
const HEADER = { content: { mod: "mh-pane" }, height: 36, position: "top" };
const HINTS = "mh-copy.hints";
const TABS = [["spacing", "Spacing"], ["hints", "Hints"], ["links", "Links"], ["board", "Board"], ["sidebar", "Sidebar"]];

// mh-spaces reads `related` with the same default.
const LINKS = "mh-links";
const LINK_DEFAULTS = { related: true };
const SWITCHES = [
  { key: "related", label: "Linked issues and PRs", about: "a PR's issues, an issue's PRs" },
];
const linkValue = (key) => shared(LINKS)?.[key] ?? LINK_DEFAULTS[key];

// mh-spaces' PREF_DEFAULTS.
const PREFS = { "mh-spaces": { icon: "shown" } };
const SHOWN = [["shown", "Shown"], ["hidden", "Hidden"]];
const SIDEBAR_ROWS = [
  { store: "mh-spaces", key: "icon", label: "Icon", options: SHOWN },
];
const SECTIONS = { "mh-spaces": "SPACES" };
const prefValue = (row) => shared(row.store)?.[row.key] ?? PREFS[row.store][row.key];

function setPref(row, value) {
  const { [row.key]: _, ...rest } = shared(row.store) ?? {};
  setShared(row.store, value === PREFS[row.store][row.key] ? rest : { ...rest, [row.key]: value });
}

function cyclePref(row, delta) {
  const i = row.options.findIndex(([v]) => v === prefValue(row));
  setPref(row, row.options[(i + delta + row.options.length) % row.options.length][0]);
}

const segmented = (t, id, options, value, pick) => h_flex().flex_none().gap(4).text_size(12).children(options.map(([v, label]) => button(div(), t, value === v)
  .id(`${id}-${v}`).px(9).py(3).cursor_pointer()
  .text_color(value === v ? t.foreground : t.muted)
  .when(value !== v, (el) => el.hover((s) => s.text_color(t.foreground)))
  .on_click((_e, cx) => { pick(v); cx.notify(); })
  .child(label)));

// Only what differs from the defaults is kept.
function setLink(key, value) {
  const { [key]: _, ...rest } = shared(LINKS) ?? {};
  setShared(LINKS, value === LINK_DEFAULTS[key] ? rest : { ...rest, [key]: value });
}

function find(node, test) {
  if (!node) return null;
  if (test(node)) return node;
  for (const child of node.children ?? []) {
    const found = find(child, test);
    if (found) return found;
  }
  return null;
}

// The tab block's pane frame, and the row around it (its gap is the space before the side panel; the layout root gives the margin).
const frameOf = (root) => find(root, (n) => n.content?.pane)?.content.pane ?? null;
const areaOf = (root) => find(root, (n) => (n.children ?? []).some((c) => c.content?.pane));

function current() {
  const root = layout();
  const [padX, padY] = root?.terminal_padding ?? [DEFAULT.padX, DEFAULT.padY];
  const header = frameOf(root)?.header;
  return { gap: frameOf(root)?.gap ?? DEFAULT.gap, padX, padY, bars: !header ? "none" : header.reveal === "hover" ? "hover" : "always" };
}

function edit(change) {
  const root = JSON.parse(JSON.stringify(layout()));
  change(root);
  run("layout.set", { layout: root });
}

function spacing(root, values) {
  const frame = frameOf(root);
  const area = areaOf(root);
  if (frame) {
    frame.gap = values.gap;
    frame.radius = values.gap > 0 ? 12 : 0;
  }
  if (area) {
    area.gap = values.gap;
  }
  root.terminal_padding = [values.padX, values.padY];
}

// A hidden header is kept as shared("mh-spacing.header"), so showing it again brings back its mod and size.
function bars(root, mode) {
  const frame = frameOf(root);
  if (!frame) return;
  if (mode === "none") {
    if (frame.header) setShared("mh-spacing.header", frame.header);
    delete frame.header;
    return;
  }
  frame.header = { ...(frame.header ?? shared("mh-spacing.header") ?? HEADER), reveal: mode };
}

const isOn = (p) => shared(HINTS)?.[p.id] ?? p.on;

function toggle(p) {
  const { [p.id]: _, ...rest } = shared(HINTS) ?? {};
  setShared(HINTS, isOn(p) === p.on ? { ...rest, [p.id]: !p.on } : rest);
}

export default class Spacing extends View {
  init(_props, cx) {
    track("mh-spacing.open", "open");
    this.at = 0;
    this.hint = 0;
    this.link = 0;
    this.side = 0;
    this.tab = TABS.find(([id]) => id === localStorage.getItem("tab"))?.[0] ?? "spacing";
    this.patterns = null;
    // Tab and shift-tab move app focus before on_key_down: our own bindings, deeper in, come first.
    try {
      cx.bind_keys([
        { keystroke: "tab", action: "mh_spacing_next_tab", context: "MhSpacing" },
        { keystroke: "shift-tab", action: "mh_spacing_prev_tab", context: "MhSpacing" },
      ]);
    } catch {}
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.editing = null;
    boardTabInit(this);
    cx.spawn(async (cx) => {
      try {
        this.patterns = JSON.parse((await readTextFile(`${appHome()}/mods/mh-copy/patterns.json`)) ?? "[]");
      } catch {
        this.patterns = [];
      }
      cx.notify();
    });
  }

  change(key, delta) {
    const row = ROWS.find((r) => r.key === key);
    const values = current();
    const next = Math.max(0, Math.min(row.max, values[key] + delta));
    if (next !== values[key]) edit((root) => spacing(root, { ...values, [key]: next }));
  }

  cycle(delta) {
    const i = BARS.findIndex(([mode]) => mode === current().bars);
    edit((root) => bars(root, BARS[(i + delta + BARS.length) % BARS.length][0]));
  }

  show(tab) {
    this.tab = tab;
    localStorage.setItem("tab", tab);
  }

  // Tab and shift-tab: the next or previous tab, wrapping. Not while a field is edited.
  step(by, cx) {
    if (this.editing || this.help) return;
    this.show(TABS[(TABS.findIndex(([id]) => id === this.tab) + by + TABS.length) % TABS.length][0]);
    cx.notify();
  }

  key(e) {
    trackKey(`mh-spacing.${this.tab}`, e, this.editing);
    if (helpKey(this, e, this.editing ? this.addRepo : null, !(this.editing && this.addRepo.value()))) return true;
    if (this.editing) return false;
    const up = e.key === "up" || e.key === "k";
    const down = e.key === "down" || e.key === "j";
    const step = e.key === "left" || e.key === "h" || e.key === "-" ? -1 : e.key === "right" || e.key === "l" || e.key === "+" || e.key === "=" ? 1 : 0;
    if (this.tab === "sidebar") {
      const n = SIDEBAR_ROWS.length;
      if (up) this.side = (this.side + n - 1) % n;
      else if (down) this.side = (this.side + 1) % n;
      else if (step) cyclePref(SIDEBAR_ROWS[this.side], step);
      else return false;
      return true;
    }
    if (this.tab === "board") return boardKey(this, e);
    if (this.tab === "links") {
      const n = SWITCHES.length;
      if (up) this.link = (this.link + n - 1) % n;
      else if (down) this.link = (this.link + 1) % n;
      else if (e.key === "space" || e.key === "enter") setLink(SWITCHES[this.link].key, !linkValue(SWITCHES[this.link].key));
      else return false;
      return true;
    }
    if (this.tab === "hints") {
      const n = this.patterns?.length ?? 0;
      if (up && n) this.hint = (this.hint + n - 1) % n;
      else if (down && n) this.hint = (this.hint + 1) % n;
      else if ((e.key === "space" || e.key === "enter") && n) toggle(this.patterns[this.hint]);
      else return false;
      return true;
    }
    const n = ROWS.length + 1;
    if (up) this.at = (this.at + n - 1) % n;
    else if (down) this.at = (this.at + 1) % n;
    else if (step && this.at === ROWS.length) this.cycle(step);
    else if (step) this.change(ROWS[this.at].key, step * STEP);
    else return false;
    return true;
  }

  spacing(t) {
    const values = current();
    const step = (id, icon, on) => button(div(), t, false).id(id).size(24).flex_none().flex().items_center().justify_center()
      .text_color(t.muted).cursor_pointer().hover((s) => s.text_color(t.foreground))
      .on_click((_e, cx) => { on(); cx.notify(); })
      .child(svg(`mods/workspace-chrome/${icon}.svg`).size(12));
    const row = (r, i) => h_flex()
      .id(`row-${r.key}`)
      .h(34)
      .px(8)
      .gap(6)
      .flex_none()
      .items_center()
      .rounded(6)
      .when(i === this.at, (el) => el.bg(t.selected))
      .on_click((_e, cx) => { this.at = i; cx.notify(); })
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(r.label))
      .child(step(`less-${r.key}`, "minus", () => this.change(r.key, -STEP)))
      .child(div().w(44).flex_none().text_center().text_color(t.foreground).child(`${values[r.key]} px`))
      .child(step(`more-${r.key}`, "plus", () => this.change(r.key, STEP)));
    const titleBars = h_flex()
      .id("row-bars")
      .h(34)
      .px(8)
      .gap(6)
      .flex_none()
      .items_center()
      .rounded(6)
      .when(this.at === ROWS.length, (el) => el.bg(t.selected))
      .on_click((_e, cx) => { this.at = ROWS.length; cx.notify(); })
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child("Pane title bars"))
      .child(segmented(t, "bars", BARS, values.bars, (mode) => { this.at = ROWS.length; edit((root) => bars(root, mode)); }));
    const changed = ROWS.some((r) => values[r.key] !== DEFAULT[r.key]) || values.bars !== "always";
    return {
      body: v_flex().flex_1().min_h(0).gap(4).children(ROWS.map(row)).child(titleBars),
      reset: changed ? () => edit((root) => (spacing(root, DEFAULT), bars(root, "always"))) : null,
    };
  }

  hints(t) {
    const row = (p, i) => {
      const on = isOn(p);
      return h_flex()
        .id(`hint-${p.id}`)
        .h(30)
        .px(8)
        .gap(10)
        .flex_none()
        .items_center()
        .rounded(6)
        .cursor_pointer()
        .when(i === this.hint, (el) => el.bg(t.selected))
        .when(i !== this.hint, (el) => el.hover((s) => s.bg(t.hover)))
        .on_click((_e, cx) => { this.hint = i; toggle(p); cx.notify(); })
        .child(check(t, on))
        .child(div().flex_none().text_color(on ? t.foreground : t.muted).child(p.label))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(11.5).text_color(t.dim).child(p.example));
    };
    return {
      body: v_flex().id("hint-list").flex_1().min_h(0).gap(2).overflow_y_scroll()
        .children((this.patterns ?? []).map(row))
        .when(this.patterns?.length === 0, (el) => el.child(div().p(8).text_color(t.dim).child("Couldn't read mh-copy/patterns.json."))),
      reset: Object.keys(shared(HINTS) ?? {}).length ? () => setShared(HINTS, {}) : null,
    };
  }

  links(t) {
    const on = (key) => Boolean(linkValue(key));
    const row = (sw, i) => h_flex()
      .id(`link-${sw.key}`)
      .h(30)
      .px(8)
      .gap(10)
      .flex_none()
      .items_center()
      .rounded(6)
      .cursor_pointer()
      .when(i === this.link, (el) => el.bg(t.selected))
      .when(i !== this.link, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click((_e, cx) => { this.link = i; setLink(sw.key, !on(sw.key)); cx.notify(); })
      .child(check(t, on(sw.key)))
      .child(div().flex_none().text_color(on(sw.key) ? t.foreground : t.muted).child(sw.label))
      .child(div().flex_1().min_w(0).truncate().text_right().text_size(11.5).text_color(t.dim).child(sw.about));
    return {
      body: v_flex().flex_1().min_h(0).gap(4)
        .children(SWITCHES.map(row)),
      reset: Object.keys(shared(LINKS) ?? {}).length ? () => setShared(LINKS, {}) : null,
    };
  }

  sidebar(t) {
    const row = (r, i) => h_flex()
      .id(`side-${r.store}-${r.key}`)
      .h(34)
      .px(8)
      .gap(6)
      .flex_none()
      .items_center()
      .rounded(6)
      .when(i === this.side, (el) => el.bg(t.selected))
      .on_click((_e, cx) => { this.side = i; cx.notify(); })
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(r.label))
      .child(segmented(t, `side-${r.store}-${r.key}`, r.options, prefValue(r), (v) => { this.side = i; setPref(r, v); }));
    const section = (store) => div().px(8).pt(6).flex_none().text_size(11).font_semibold().text_color(t.dim).child(SECTIONS[store]);
    return {
      body: v_flex().flex_1().min_h(0).gap(4)
        .children(SIDEBAR_ROWS.flatMap((r, i) => [...(SIDEBAR_ROWS[i - 1]?.store !== r.store ? [section(r.store)] : []), row(r, i)]))
        .child(div().px(8).pt(10).text_size(11.5).text_color(t.dim)
          .child("The agent's title is Claude's /rename or AI title, or the title another agent sets. The latest update is Claude's summary of its last turn. Right-click an agent to give it a description of its own or hide its description.")),
      reset: Object.keys(PREFS).some((store) => Object.keys(shared(store) ?? {}).length) ? () => { for (const store of Object.keys(PREFS)) setShared(store, {}); } : null,
    };
  }

  render() {
    const t = theme();
    const view = this.tab === "hints" ? this.hints(t) : this.tab === "links" ? this.links(t) : this.tab === "board" ? boardTab(this, t) : this.tab === "sidebar" ? this.sidebar(t) : this.spacing(t);
    const tab = ([id, label]) => button(div(), t, this.tab === id).id(`tab-${id}`).px(9).py(3).cursor_pointer().text_size(11.5)
      .text_color(this.tab === id ? t.foreground : t.muted).hover((s) => s.text_color(t.foreground))
      .on_click((_e, cx) => { this.show(id); cx.notify(); })
      .child(label.toUpperCase());
    return v_flex()
      .id("spacing")
      .track_focus(this.handle)
      .key_context("MhSpacing")
      .on_action("mh_spacing_next_tab", (_e, cx) => this.step(1, cx))
      .on_action("mh_spacing_prev_tab", (_e, cx) => this.step(-1, cx))
      .on_key_down((e, cx) => {
        if (e.key === "escape" && !this.help) return closeOverlay(props().overlay);
        if (!this.key(e)) return;
        cx.stop_propagation();
        cx.notify();
      })
      .size_full()
      .relative()
      .p(16)
      .gap(8)
      .bg(t.popover)
      .text_size(13)
      .child(h_flex().gap(6).items_center().font_semibold().children(TABS.map(tab)))
      .child(view.body)
      .child(h_flex().gap(8).items_center().text_size(11).text_color(t.dim)
        .child(button(div(), t, false).id("reset").px(9).py(3).text_color(view.reset ? t.muted : t.dim)
          .when(Boolean(view.reset), (el) => el.cursor_pointer().hover((s) => s.text_color(t.foreground))
            .on_click((_e, cx) => { view.reset(); cx.notify(); }))
          .child("RESET TO DEFAULTS"))
        .child(div().flex_1())
        .child(div().min_w(0).truncate().child(this.editing ? "↵ add · esc close" : "? keys · esc close")))
      .when(Boolean(this.help), (el) => el.child(keyPanel(t, [["KEYS", [
        ["↑↓ j k", "choose"], ["←→ h l - +", "change (Spacing, Sidebar)"], ["space ↵", "toggle (Hints, Links, Board)"],
        ["a", "add a repo (Board)"], ["↵", "add the repo typed"], ["tab ⇧tab", "next, previous tab"], ["esc", "close"],
      ]]])));
  }
}

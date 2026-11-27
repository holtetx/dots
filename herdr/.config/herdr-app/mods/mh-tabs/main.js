import { View, div, svg, image } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { button } from "./pixel.js";
import { spaces, panes, agents, run, openOverlay, theme, window, shared, setShared, layout, settings, focused, nextCommand, exec, home, notify, setBadge } from "herdr";

const CI = { failed: ["circle-x", "ansi1"], running: ["circle-dot", "ansi3"], passed: ["circle-check", "ansi2"] };

// Shows that side panel, or hides the panel when it already shows it. True when it shows it.
function togglePanel(id) {
  const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
  if (panel && !panel.hidden && body?.active === id) return run("layout.hide", { id: "panel" }), false;
  run("layout.select", { stack: "panel-body", child: id });
  run("layout.show", { id: "panel" });
  return true;
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Same as mh-spaces/title.js (mods can't import each other): drops a status glyph, keeps a leading bracket or quote.
const clean = (s) => (s ?? "").replace(/^(?:\[ [!.] \] |[✋⏳]\uFE0F?(?=\s)|(?!(?:\p{Emoji}\uFE0F|[#*]\u20E3))[^\p{L}\p{N}\p{Ps}\p{Pi}\p{Emoji_Presentation}])+/u, "").trim();

// A tab Herdr named (unnamed, or after its program) follows its agent's live
// title, as the sidebar rows do; a name the person gave stays.
function label(tab, lead) {
  const prog = lead?.program?.name;
  const base = tab.named ? tab.name : prog ?? "Terminal";
  if (!lead?.program?.agent) return base;
  const live = clean(lead.title);
  // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  // No spaces, so a slash command ("/review-all with x") is a title, not a path.
  const path = /^(?:[~/]|[A-Za-z]:\\)\S*$/.test((lead.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== lead.terminal && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== lead.program.key;
  return (tab.name === prog || !tab.named) && telling ? live : base;
}

// Space and agent next/prev, as the sidebar lists them (shared("spaces.order"): folders'
// spaces, but those folded away, and Waiting's only while its section is open).
function spaceOrder() {
  const ids = spaces().map((s) => s.id);
  const listed = shared("spaces.order");
  if (Array.isArray(listed) && listed.length) return listed.filter((id) => ids.includes(id));
  const parked = new Set(shared("spaces.waiting") ?? []);
  return [...ids.filter((id) => !parked.has(id)), ...(shared("waiting.open") ? ids.filter((id) => parked.has(id)) : [])];
}

function step(order, current, by) {
  if (!order.length) return null;
  const i = order.indexOf(current);
  return i === -1 ? (by > 0 ? order[0] : order.at(-1)) : order[(i + by + order.length) % order.length];
}

// Moves a space in or out of Waiting: shown at once, and kept on its machine by mh-spaces.
function askWaiting(id, waiting) {
  const now = shared("spaces.waiting") ?? [];
  setShared("spaces.waiting", waiting ? [...new Set([...now, id])] : now.filter((x) => x !== id));
  setShared("spaces.waiting.ask", [...(shared("spaces.waiting.ask") ?? []), { id, waiting }]);
}

// ctrl-a N: a sample of each kind of toast in turn, to see how they look.
let sample = 0;
function testToast() {
  const a = agents().find((x) => x.address === focused()?.terminal) ?? agents()[0];
  const name = a?.program?.name ?? "Agent";
  const where = a && { body: `${a.space_name} / ${a.tab_name}`, action: { name: "agent.focus", args: { terminal: a.address } } };
  const kinds = [
    where && { ...where, title: `${name} needs you` },
    where && { ...where, title: `${name} finished` },
    { title: "Sample info toast", body: "Something happened that you may want to know.", level: "info" },
    { title: "Sample warning toast", body: "Something may need a look.", level: "warning" },
    { title: "Sample error toast", body: "Something failed.", level: "error" },
  ].filter(Boolean);
  notify(kinds[sample++ % kinds.length]);
}

// A visit moves a space up the sidebar, so a run of steps keeps the order it started with.
let held = { order: [], last: null };

function navigate(command) {
  const by = command.endsWith("-next") ? 1 : -1;
  const spaceStep = command.startsWith("space-");
  const current = spaceStep ? (focused()?.space ?? spaces().find((s) => s.active)?.id) : focused()?.terminal;
  if (current !== held.last) held.order = spaceOrder();
  const ids = new Set(spaces().map((s) => s.id));
  const order = held.order.filter((id) => ids.has(id));
  if (spaceStep) {
    held.last = step(order, current, by);
    if (held.last) run("space.select", { id: held.last });
  } else {
    const list = agents().filter((a) => order.includes(a.space)).sort((a, b) => order.indexOf(a.space) - order.indexOf(b.space));
    held.last = step(list.map((a) => a.address), current, by);
    if (held.last) run("agent.focus", { terminal: held.last });
  }
}

const LAVENDER = "#b4befe";

export default class Tabs extends View {
  init(_props, cx) {
    this.pressed = null;
    this.hovered = null;
    this.scroll = ScrollHandle.new();
    try { this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}"); } catch { this.panels = {}; }
    if (!this.panels || typeof this.panels !== "object" || Array.isArray(this.panels)) this.panels = {};
    this.swipe = { acc: 0, steps: 0, at: 0, last: 0 };
    // Keys (keys.json "mh-tabs.<command>"); copy-mode and fingers act on the focused terminal through mh-copy.
    cx.spawn(async () => {
      for (;;) {
        const command = await nextCommand();
        if (/^(space|agent)-(next|prev)$/.test(command)) {
          navigate(command);
          continue;
        }
        // ctrl-1..9: the Nth space as the sidebar shows them.
        const nth = command.match(/^space-([1-9])$/);
        if (nth) {
          const id = spaceOrder()[Number(nth[1]) - 1];
          if (id) run("space.select", { id });
          continue;
        }
        if (command === "checks") {
          // Opening it from the keyboard gives it the keyboard (checks.js).
          if (togglePanel("checks")) setShared("checks.focus", Date.now());
          continue;
        }
        if (command === "test-toast") {
          testToast();
          continue;
        }
        if (command === "waiting") {
          setShared("waiting.open", !shared("waiting.open"));
          continue;
        }
        // Another window onto the same spaces (new-window.sh, in the main app home).
        if (command === "new-window") {
          exec("sh", [`${home()}/.config/herdr-app/new-window.sh`])
            .then((r) => r.code === 0 || notify({ title: "Couldn't open a window", body: (r.stderr || r.stdout).trim(), level: "error" }))
            .catch((e) => notify({ title: "Couldn't open a window", body: String(e?.message ?? e), level: "error" }));
          continue;
        }
        if (command === "wait") {
          const space = focused()?.space;
          if (space) askWaiting(space, !(shared("spaces.waiting") ?? []).includes(space));
          continue;
        }
        const terminal = focused()?.terminal;
        if (!terminal) continue;
        if (command === "copy-mode") openOverlay({ mod: "mh-copy", kind: "dialog", width: 0.92, height: 0.88, props: { action: "copy", terminal } });
        else if (command === "fingers" && focused()?.pane) openOverlay({ mod: "mh-copy", kind: "window", frame: "none", width: 2, height: 2, at: { x: 0, y: 0 }, props: { action: "fingers", terminal, pane: focused().pane, cwd: focused().cwd } });
      }
    });
  }

  // One tab per wheel notch. A touchpad or smooth-scrolling mouse sends many
  // small events per gesture: a short swipe or one smoothed notch (about
  // 25 px) switches one tab, a longer swipe keeps going a tab per 60 px, at
  // most one every 100 ms so each shows.
  wheel(e) {
    if (e.delta_lines) {
      if (e.delta_lines.y) run(e.delta_lines.y > 0 ? "tab.prev" : "tab.next");
      return;
    }
    const s = this.swipe, now = Date.now();
    // Phases often arrive only as moves (a macOS touchpad included): a pause
    // or a turn starts a new gesture.
    if (e.touch_phase === "started" || now - s.at > 250 || e.delta.y * s.acc < 0) Object.assign(s, { acc: 0, steps: 0 });
    s.at = now;
    s.acc += e.delta.y;
    const need = s.steps ? 60 : 20;
    if (Math.abs(s.acc) < need || now - s.last < 100) return;
    s.acc -= Math.sign(s.acc) * need;
    s.steps++;
    s.last = now;
    run(e.delta.y > 0 ? "tab.prev" : "tab.next");
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = theme();
    const blocked = agents().filter((a) => a.status === "blocked").length;
    if (blocked !== this.badge) {
      this.badge = blocked;
      setBadge(blocked ? String(blocked) : null);
    }
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const active = shown.findIndex(tab => tab.active);
    const selected = shown[active]?.id;
    if (selected !== this.selected || active !== this.selectedIndex) {
      this.selected = selected;
      this.selectedIndex = active;
      if (active >= 0) this.scroll.scroll_to_item(active);
    }
    const stop = (_e, cx) => cx.stop_propagation();
    const square = (id, label, action) => button(div(), t, false).id(id).size(24).flex_none().flex().items_center().justify_center().text_color(t.muted).hover(s => s.text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const item = (c, i) => {
      const lead = panes().find(p => p.tab === c.id && p.program?.agent) ?? panes().find(p => p.tab === c.id);
      const program = lead?.program;
      const name = label(c, lead);
      return h_flex().id(`tab-${c.id}`).h(26).px(10).gap(7).items_center().flex_none().rounded(10).border_1().text_size(12.5)
        .border_color(c.active ? LAVENDER + "4d" : "#00000000").when(c.active, el => el.bg(LAVENDER + "29").font_medium())
        // A rename or status dot on this or an earlier tab can push the active one out.
        .when(i <= active, el => el.on_size_change((_size, cx) => { this.scroll.scroll_to_item(active); cx.notify(); }))
        .text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.text_color(t.foreground).bg(c.active ? LAVENDER + "29" : "#ffffff0d"))
        .on_hover((on, cx) => { if (on) this.hovered = c.id; else if (this.hovered === c.id) this.hovered = null; cx.notify(); })
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(12).text_color(t.muted) : image(program.icon).size(12)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(Boolean(t[c.status]) && c.status !== "idle", el => el.child(div().size(7).flex_none().rounded_full().bg(t[c.status])
          .when(c.status === "working", d => d.loop("opacity", { from: 0.35, to: 1, period: 1400 }))
          .when(c.status === "blocked", d => d.loop("opacity", { from: 0.3, to: 1, period: 700 }))))
        .when(c.active || this.hovered === c.id, el => el.child(div().id(`close-${c.id}`).text_color(LAVENDER + "b3").hover(s => s.text_color(LAVENDER)).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(10))));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    // CHECKS (mh-spaces) is ours, so Herdr's panel list doesn't name it.
    const enabled = [...(shared("workspace.panels") ?? ["files", "changes"]), "checks"];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon, color) => {
      const on = panel && !panel.hidden && body?.active === id;
      return button(h_flex(), t, on).id(`panel-${id}`).h(24).px(9).gap(5).flex_none().items_center()
        .text_size(10.5).font_bold().text_color(on ? t.foreground : t.muted)
        .hover(s => s.text_color(t.foreground)).on_mouse_down("left", stop)
        .on_click(() => togglePanel(id))
        .child(svg(icon).size(13).when(Boolean(color), el => el.text_color(color))).child(label);
    };
    // The shown space's PR CI, from mh-spaces' git bar.
    const ci = CI[shared("checks.state")];
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(6).items_center().bg(t.chrome)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => this.wheel(e))
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(6).overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change((_size, cx) => { if (active >= 0) { this.scroll.scroll_to_item(active); cx.notify(); } })
        .children(shown.map(item)))
      .child(square("tab-new", "+", () => openOverlay({ mod: "mh-new-menu", kind: "popup", width: 250, height: 512 })))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "FILES", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "CHANGES", "mods/changes/changes.svg")))
      .child(panelButton("checks", "CHECKS", ci ? `mods/pr/${ci[0]}.svg` : "mods/pr/circle-check.svg", ci && t[ci[1]]))
      .when(w?.buttons, el => el.child(square("minimize", w.platform === "windows" ? svg("mods/mh-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(square("maximize", w.platform === "windows" ? svg(`mods/mh-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(square("close-window", w.platform === "windows" ? svg("mods/mh-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}

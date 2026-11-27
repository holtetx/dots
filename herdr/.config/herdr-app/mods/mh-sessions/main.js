// Claude Code sessions: the session search (mod.open) and the tasks list ({ tasks: true }, tasks.js).

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { agents, spaces, panes, theme, shared, setShared, props, run, exec, hc, home, appHome, readTextFile, closeOverlay } from "herdr";
import { base, ago, worktree, label, place, missing, resume } from "./sessions.js";
import { bindPanelKeys, frame, helpKey, ink, keyPanel, mark, panelKeys, statusMarks, WORDS } from "./pixel.js";
import { taskInit, taskRender } from "./tasks.js";

const LIST = 440;
const ICON = (name) => `mods/workspace-chrome/${name}.svg`;
// Space avatar colors, as the mh-spaces sidebar draws them.
const MARK = { ansi6: "#6fc7bd", ansi3: "#8fa3f0", ansi4: "#7aa7e8", ansi5: "#b394f0", ansi2: "#8fcf94", ansi1: "#e49ac8" };

const avatar = (color, title, t) => {
  const fill = color.startsWith("#") ? color : (MARK[color] ?? t[color]);
  return h_flex().size(14).rounded(4).bg(fill).items_center().justify_center().text_size(8.5).font_bold().text_color(ink(fill)).child([...title][0]?.toUpperCase() ?? "?");
};

// When an agent in the space last changed state (0: not since Herdr started).
const activity = (w) => Math.max(0, ...w.tabs.map((t) => t.changed_at ?? 0));
const claude = (a) => !a.address.includes("/") && (a.app === "claude-code" || a.program?.key === "claude");

async function sessionOf(pid) {
  const s = JSON.parse((await readTextFile(`${home()}/.claude/sessions/${pid}.json`).catch(() => null)) ?? "null");
  return s?.sessionId ? s : null;
}

// The Claude sessions running here: ~/.claude/sessions/<pid>.json describes
// the terminal's foreground process, or its child when a shell launched it.
async function live() {
  const found = await Promise.all(
    agents()
      .filter(claude)
      .map(async (a) => {
        try {
          const pid = JSON.parse((await hc(["get", a.address, "--json"])).stdout).foreground?.pid;
          if (!pid) return null;
          let s = await sessionOf(pid);
          for (const kid of s ? [] : (await exec("pgrep", ["-P", String(pid)])).stdout.split(/\s+/).filter(Boolean)) s ??= await sessionOf(kid);
          return s ? { address: a.address, pane: a.pane, tab: a.tab, space: a.space, id: s.sessionId, cwd: s.cwd, title: a.title || s.name || "Claude", status: a.status } : null;
        } catch {
          return null;
        }
      }),
  );
  return found.filter(Boolean);
}

let node = null;
const nodejs = async () => (node ??= (await exec("sh", ["-lc", "command -v node"])).stdout.trim() || "node");

async function history() {
  const r = await exec(await nodejs(), [`${appHome()}/mods/mh-sessions/scan.mjs`], { timeout: 60000 });
  return r.code === 0 ? JSON.parse(r.stdout) : [];
}

export default class Sessions extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.mode = p.tasks ? "tasks" : "search";
    this.error = "";
    this.handle = cx.focus_handle();
    this.handle.focus();
    bindPanelKeys(cx);
    if (this.mode === "tasks") return taskInit(this, cx);
    this.initSearch(cx);
  }

  hide() {
    closeOverlay(props().overlay);
  }

  close() {
    // mh-spaces toggles the tasks list (ctrl-a t) by this id.
    if (this.mode === "tasks" && shared("tasks.overlay") === props()?.overlay) setShared("tasks.overlay", null);
    // The board it was opened over takes the keyboard back.
    if (this.mode === "tasks" && props()?.parent) setShared("board.focus", Date.now());
  }

  // Resumes a session, its folder made again or (here) its repo used when it's gone.
  start(s, here, cx, done) {
    if (this.busy) return;
    this.busy = s.id;
    this.error = "";
    cx.notify();
    cx.spawn(async (cx) => {
      this.error = await resume(s, here);
      this.busy = null;
      if (!this.error) done?.();
      cx.notify();
    });
  }

  // What resuming s does when its folder is gone: ↵ makes its workspace again, ⇧ uses the repo.
  goneHint(s, enter, shift) {
    const w = worktree(s.cwd);
    return w ? `${enter} recreate workspace · ${shift} resume in ${base(w.repo)}` : `${enter} resume in a parent folder`;
  }

  initSearch(cx) {
    this.text = "";
    this.at = 0;
    this.open = undefined;
    this.history = undefined;
    this.gone = {};
    this.childOf = [];
    this.scroll = ScrollHandle.new();
    this.input = InputState.new({ placeholder: "Search sessions…" });
    this.input.on("change", (_e, cx) => {
      this.text = this.input.value();
      this.at = 0;
      this.error = "";
      cx.notify();
    });
    this.input.on("submit", (e, cx) => this.go(this.items()[this.at], cx, Boolean(e?.shift)));
    this.input.focus();
    // Orders are taken once: the selection is a row number, so rows must not move under it.
    this.rank = new Map([...spaces()].sort((a, b) => activity(b) - activity(a)).map((w, i) => [w.id, i]));
    cx.spawn(async (cx) => {
      const seq = Object.fromEntries(agents().map((a) => [a.address, a.seq]));
      this.open = (await live()).sort((a, b) => (seq[b.address] ?? 0) - (seq[a.address] ?? 0));
      cx.notify();
    });
    cx.spawn(async (cx) => {
      this.history = await history().catch(() => []);
      cx.notify();
      const gone = await missing([...new Set(this.history.map((s) => s.cwd).filter(Boolean))]).catch(() => new Set());
      this.gone = Object.fromEntries([...gone].map((c) => [c, true]));
      cx.notify();
    });
  }

  sections() {
    const f = this.text.trim().toLowerCase();
    const match = (s) => !f || `${s.title} ${label(s.cwd)} ${s.cwd} ${s.machine ?? ""} ${s.prompt ?? ""}`.toLowerCase().includes(f);
    const ps = panes();
    const colors = shared("space.colors") ?? {};
    const all = spaces().map((w) => ({
      id: w.id,
      title: w.name,
      cwd: place(w, ps) ?? "",
      machine: w.machine,
      color: colors[w.id] ?? "ansi6",
      meta: ["blocked", "done", "working"].includes(w.status) ? WORDS[w.status] : `${w.tabs.length} tab${w.tabs.length === 1 ? "" : "s"}`,
    }));
    const skip = new Set((this.open ?? []).map((s) => s.id));
    const past = (this.history ?? []).filter((s) => !skip.has(s.id) && match(s));
    // Spaces in Waiting (mh-spaces' shared("spaces.waiting")) and their open sessions
    // have a section of their own: each space, then its sessions.
    const parked = new Set(shared("spaces.waiting") ?? []);
    const open = this.open ?? [];
    const recent = [...all].sort((a, b) => (this.rank.get(a.id) ?? all.length) - (this.rank.get(b.id) ?? all.length));
    const waiting = all.filter((w) => parked.has(w.id)).flatMap((w) => {
      const mine = open.filter((s) => s.space === w.id && match(s)).map((s) => ({ ...s, kind: "open" }));
      return match(w) || mine.length ? [{ ...w, kind: "space" }, ...mine] : [];
    });
    return [
      { name: "Open", kind: "open", list: open.filter((s) => !parked.has(s.space) && match(s)), loading: this.open === undefined },
      { name: "Spaces", kind: "space", list: recent.filter((w) => !parked.has(w.id) && match(w)), loading: false },
      { name: "Waiting", kind: "waiting", list: waiting, loading: false },
      { name: "History", kind: "history", list: past.slice(0, 100), total: past.length, loading: this.history === undefined },
    ];
  }

  items() {
    return this.sections().flatMap(({ kind, list }) => list.map((s) => ({ kind: kind === "waiting" ? s.kind : kind, s })));
  }

  go(it, cx, here = false) {
    if (!it) return;
    if (it.kind === "open" || it.kind === "space") {
      this.hide();
      return it.kind === "open" ? run("pane.focus", { pane: it.s.pane }) : run("space.select", { id: it.s.id });
    }
    this.start(it.s, here, cx, () => this.hide());
  }

  render() {
    const t = theme();
    if (this.mode === "tasks") return taskRender(this, t);
    return this.renderSearch(t);
  }

  renderSearch(t) {
    const sections = this.sections();
    const items = this.items();
    this.at = Math.min(this.at, Math.max(0, items.length - 1));
    const selected = items[this.at];
    const row = (kind, s, i) => {
      const on = i === this.at;
      const icon =
        kind === "open"
          ? (mark(s.status, t) ?? "")
          : kind === "space"
            ? avatar(s.color, s.title, t)
            : svg(ICON("clock")).size(13).text_color(t.dim);
      return h_flex()
        .id(`ss-${kind}-${s.id}`)
        .h(32)
        .flex_none()
        .px(10)
        .gap(9)
        .items_center()
        .rounded(6)
        .cursor_pointer()
        .when(on, (el) => el.bg(t.selected))
        .when(!on, (el) => el.hover((st) => st.bg(t.hover)))
        .on_click((e, cx) => this.go({ kind, s }, cx, e.modifiers.shift))
        .child(h_flex().w(14).flex_none().justify_center().child(icon))
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(s.title))
        .child(div().flex_none().max_w(220).truncate().text_size(11.5).text_color(t.dim).child(this.busy === s.id ? "resuming…" : `${s.machine ? `${s.machine} · ` : ""}${label(s.cwd)}${this.gone[s.cwd] && kind !== "open" ? " · gone" : ""}`))
        .child(h_flex().flex_none().w(52).justify_end().text_size(11).text_color(t.dim).child(kind === "open" ? WORDS[s.status] : kind === "space" ? s.meta : ago(s.at)));
    };
    const children = [];
    this.childOf = [];
    let n = 0;
    for (const { name, kind, list, total, loading } of sections) {
      if (!list.length && !loading) continue;
      children.push(h_flex().h(26).px(10).pt(6).flex_none().items_center().text_size(11).font_semibold().text_color(t.dim).child(loading ? `${name.toUpperCase()} · loading…` : `${name.toUpperCase()} · ${total > list.length ? `${list.length} of ${total}` : list.length}`));
      for (const s of list) {
        this.childOf[n] = children.length;
        children.push(row(kind === "waiting" ? s.kind : kind, s, n++));
      }
    }
    const empty = items.length === 0 && !sections.some((s) => s.loading);
    const height = Math.min(LIST, empty ? 40 : sections.filter((s) => s.list.length || s.loading).length * 26 + items.length * 32);
    const hint = this.busy ? "resuming…" : selected?.kind === "history" && this.gone[selected.s.cwd] ? this.goneHint(selected.s, "↵", "⇧↵") : "";
    return v_flex()
      .id("sessions")
      .relative()
      .track_focus(this.handle)
      .map((el) => panelKeys(el, Boolean(this.help)))
      .on_key_down((e, cx) => {
        if (helpKey(this, e, this.input, !this.text)) return cx.stop_propagation(), cx.notify();
        const count = items.length;
        const ctrl = e.modifiers.control && !e.modifiers.platform && !e.modifiers.alt && !e.modifiers.shift;
        const down = e.key === "down" || (ctrl && (e.key === "j" || e.key === "n"));
        const up = e.key === "up" || (ctrl && (e.key === "k" || e.key === "p"));
        if (e.key === "escape") return this.hide();
        if (down && count) this.at = (this.at + 1) % count;
        else if (up && count) this.at = (this.at + count - 1) % count;
        else return;
        this.scroll.scroll_to_item(this.childOf[this.at] ?? 0);
        cx.stop_propagation();
        cx.notify();
      })
      .w_full()
      .min_h(0)
      .when(Boolean(this.help), (el) => el.min_h(390))
      .p(18)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child("SESSIONS"))
      .child(
        frame(h_flex(), t.accent, t.background)
          .h(36)
          .flex_none()
          .px(12)
          .gap(8)
          .items_center()
          .child(svg(ICON("search")).size(15).text_color(t.dim))
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)),
      )
      .child(
        v_flex()
          .id("ss-list")
          .h(height)
          .flex_none()
          .overflow_y_scrollbar()
          .track_scroll(this.scroll)
          .children(children)
          .when(empty, (el) => el.child(div().p(10).text_color(t.dim).child("No matching sessions."))),
      )
      .when(Boolean(this.error), (el) => el.child(div().text_color(t.blocked).child(this.error)))
      .child(h_flex().justify_end().text_size(11).text_color(t.dim).child([hint, "? keys", "esc close"].filter(Boolean).join(" · ")))
      .when(Boolean(this.help), (el) => el.child(this.helpPanel(t)));
  }

  helpPanel(t) {
    const keys = [
      ["type", "search titles, folders, machines and prompts"], ["↓↑ ^J ^K ^N ^P", "move"],
      ["↵", "go to an open session or space, resume a past one"], ["⇧↵", "resume in its repo when its folder is gone"], ["esc", "close"],
    ];
    const marks = [
      [statusMarks(t), "open session: working, needs you, done; idle has none"],
      [avatar("ansi6", "Space", t), "a space, in its sidebar color"],
      [svg(ICON("clock")).size(13).text_color(t.dim), "a past session"],
      [div().text_size(11.5).text_color(t.dim).child("· gone"), "its folder is gone"],
    ];
    return keyPanel(t, [["KEYS", keys], ["MARKS", marks]]);
  }
}

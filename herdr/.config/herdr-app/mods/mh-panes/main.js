// Moves terminal panes. Opened as an overlay with props { action, terminal }: "tab"
// (a new tab in its space) or "space" (a picker: one of the space's machine's other
// spaces, or a new one).
//
// A pane moves by parking its terminal and labelling it with the space and tab
// it should show in; Herdr makes a space or tab for ids it doesn't know.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, shared, props, run, hc, theme, notify, closeOverlay } from "herdr";
import { frame, ink } from "./pixel.js";

const MARK = { ansi6: "#6fc7bd", ansi3: "#8fa3f0", ansi4: "#7aa7e8", ansi5: "#b394f0", ansi2: "#8fcf94", ansi1: "#e49ac8" };

const hex = () => Array.from({ length: 32 }, () => ((Math.random() * 16) | 0).toString(16)).join("");
const machineOf = (id) => (id.includes("/") ? id.split("/")[0] : null);
const local = (id) => id.split("/").pop();
const sleep = (cx, ms) => new Promise((resolve) => cx.timer.after(ms, () => resolve()));

async function waitFor(cx, done, ms = 4000) {
  for (let waited = 0; waited < ms; waited += 50) {
    if (done()) return true;
    await sleep(cx, 50);
  }
  return done();
}

const paneOf = (terminal) => panes().find((p) => p.terminal === terminal);
const tabOf = (terminal) => spaces().flatMap((s) => s.tabs.map((t) => ({ s, t }))).find(({ t }) => t.id === paneOf(terminal)?.tab);

async function park(cx, terminal) {
  run("terminal.park", { terminal });
  if (!(await waitFor(cx, () => !paneOf(terminal)))) throw new Error(`couldn't take ${terminal}'s pane away`);
}

// Shows a parked terminal in a space and tab, new ones when Herdr doesn't know the ids.
async function place(cx, terminal, space, tab) {
  const r = await hc(["label", terminal, `herdr.space=${local(space)}`, `herdr.tab=${local(tab)}`]);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout || "hc label failed").trim());
  if (!(await waitFor(cx, () => Boolean(paneOf(terminal))))) throw new Error(`${terminal} didn't come back`);
}

async function toTab(cx, terminal) {
  const from = tabOf(terminal);
  if (!from) throw new Error("no pane to move");
  if (from.s.tabs.length === 1 && panes().filter((p) => p.tab === from.t.id).length === 1) return;
  const tab = `tb${hex()}`;
  await park(cx, terminal);
  await place(cx, terminal, from.s.id, tab);
  run("tab.select", { id: paneOf(terminal).tab });
  run("pane.focus", { terminal });
}

async function toSpace(cx, terminal, target, name) {
  const machine = machineOf(terminal);
  const space = target ?? `${machine ? `${machine}/` : ""}sp${hex()}`;
  await park(cx, terminal);
  await place(cx, terminal, space, `tb${hex()}`);
  const s = spaces().find((x) => x.tabs.some((t) => t.id === paneOf(terminal).tab));
  if (!target && name && s) run("space.rename", { id: s.id, name });
  if (s) run("space.select", { id: s.id });
  run("pane.focus", { terminal });
}

const fail = (error) => notify({ title: "Couldn't move the pane", body: String(error?.message ?? error), level: "error" });

export default class Panes extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.picking = p.action === "space";
    this.handle = cx.focus_handle();
    if (!this.picking) {
      cx.spawn(async (cx) => {
        try {
          if (p.action === "tab") await toTab(cx, p.terminal);
        } catch (error) {
          fail(error);
        }
        closeOverlay(p.overlay);
      });
      return;
    }
    this.text = "";
    this.at = 0;
    this.input = InputState.new({ placeholder: "Space, or a name for a new one" });
    this.input.on("change", (_e, cx) => {
      this.text = this.input.value();
      this.at = 0;
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.pick(this.choices()[this.at], cx));
    this.input.focus();
  }

  choices() {
    const p = props() ?? {};
    const from = tabOf(p.terminal)?.s;
    const machine = machineOf(p.terminal);
    const f = this.text.trim();
    const list = spaces()
      .filter((s) => s.id !== from?.id && (s.machine ?? null) === machine && (!f || s.name.toLowerCase().includes(f.toLowerCase())))
      .map((s) => ({ space: s }));
    const exact = list.some(({ space }) => space.name.toLowerCase() === f.toLowerCase());
    return [...list, ...(exact ? [] : [{ name: f }])];
  }

  pick(choice, cx) {
    if (!choice || this.busy) return;
    const p = props();
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        await toSpace(cx, p.terminal, choice.space?.id ?? null, choice.name);
      } catch (error) {
        fail(error);
      }
      closeOverlay(p.overlay);
    });
  }

  render() {
    const t = theme();
    if (!this.picking) return div();
    const choices = this.choices();
    this.at = Math.min(this.at, Math.max(0, choices.length - 1));
    const colors = shared("space.colors") ?? {};
    const avatar = (s) => {
      const c = colors[s.id] ?? "ansi6";
      return h_flex().size(16).flex_none().rounded(4).bg(c.startsWith("#") ? c : (MARK[c] ?? t[c])).items_center().justify_center().text_size(9).font_bold().text_color(ink(c.startsWith("#") ? c : (MARK[c] ?? t[c]))).child([...s.name][0]?.toUpperCase() ?? "?");
    };
    const row = (choice, i) =>
      h_flex()
        .id(`mv-${i}`)
        .h(30)
        .flex_none()
        .px(10)
        .gap(9)
        .items_center()
        .rounded(6)
        .cursor_pointer()
        .when(i === this.at, (el) => el.bg(t.selected))
        .when(i !== this.at, (el) => el.hover((s) => s.bg(t.hover)))
        .on_click((_e, cx) => this.pick(choice, cx))
        .child(choice.space ? avatar(choice.space) : div().w(16).flex_none().text_color(t.dim).child("+"))
        .child(div().flex_1().min_w(0).truncate().text_color(choice.space ? t.foreground : t.muted).child(choice.space ? choice.space.name : choice.name ? `New space “${choice.name}”` : "New space"));
    return v_flex()
      .id("move-pane")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        const n = choices.length;
        const ctrl = e.modifiers.control && !e.modifiers.platform && !e.modifiers.alt;
        if (e.key === "escape") return closeOverlay(props().overlay);
        if ((e.key === "down" || (ctrl && (e.key === "j" || e.key === "n"))) && n) this.at = (this.at + 1) % n;
        else if ((e.key === "up" || (ctrl && (e.key === "k" || e.key === "p"))) && n) this.at = (this.at + n - 1) % n;
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .size_full()
      .p(16)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .child(div().font_semibold().text_color(t.foreground).child("MOVE PANE TO SPACE"))
      .child(frame(Input.new(this.input), t.accent, t.background).flex_none().h(32).px(10).items_center().text_color(t.foreground))
      .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().children(choices.map(row)))
      .child(h_flex().justify_end().text_size(11).text_color(t.dim).child(this.busy ? "moving…" : "↵ move · esc cancel"));
  }
}

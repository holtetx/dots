// Scroll mode, like tmux's copy mode: vim keys scroll the focused terminal until
// q or Esc, which goes back to the bottom. Claude Code (fullscreen) scrolls itself,
// so it gets the keys it scrolls on through `hc keys`; its line keys are
// shift+pageup/pagedown, which ~/.claude/keybindings.json binds to
// scroll:lineUp/lineDown. Other terminals scroll Herdr's view of their history.

import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { props, focused, terminals, theme, run, hc, closeOverlay } from "herdr";
import { chip, frame, helpKey, keyPanel } from "./pixel.js";

// Each move: [the keys Claude gets, terminal.scroll's args for the rest].
const MOVES = {
  down: [["shift+pagedown"], { lines: 1 }],
  up: [["shift+pageup"], { lines: -1 }],
  halfDown: [["pagedown"], { pages: 0.5 }],
  halfUp: [["pageup"], { pages: -0.5 }],
  pageDown: [["pagedown", "pagedown"], { pages: 1 }],
  pageUp: [["pageup", "pageup"], { pages: -1 }],
  top: [["ctrl+home"], { to: "top" }],
  bottom: [["ctrl+end"], { to: "bottom" }],
};

function moveOf(key, ctrl, shift) {
  if (ctrl) return { d: "halfDown", u: "halfUp", f: "pageDown", b: "pageUp", e: "down", y: "up", n: "down", p: "up" }[key];
  if (key === "G" || (shift && key === "g")) return "bottom";
  if (shift) return null;
  return { j: "down", down: "down", k: "up", up: "up", space: "pageDown", b: "pageUp", pagedown: "halfDown", pageup: "halfUp", g: "top", home: "top", end: "bottom" }[key];
}

export default class Scroll extends View {
  init(_props, cx) {
    this.terminal = focused()?.terminal ?? null;
    const t = terminals().find((x) => x.address === this.terminal);
    this.claude = t?.program?.key === "claude" || t?.agent === "claude-code";
    this.moved = false;
    this.queue = Promise.resolve();
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  go(name, cx) {
    const [keys, args] = MOVES[name];
    if (!this.terminal) return;
    this.moved = true;
    if (!this.claude) return run("terminal.scroll", { terminal: this.terminal, ...args });
    cx.spawn(async () => {
      this.queue = this.queue.then(() => hc(["keys", this.terminal, ...keys])).catch(() => null);
      await this.queue;
    });
  }

  async close() {
    if (!this.terminal || !this.moved) return;
    if (this.claude) await hc(["keys", this.terminal, ...MOVES.bottom[0]]).catch(() => null);
    else run("terminal.scroll", { terminal: this.terminal, ...MOVES.bottom[1] });
  }

  render() {
    const t = theme();
    return frame(h_flex(), t.accent, t.popover)
      .id("scroll")
      .relative()
      .w_full()
      .h(this.help ? 300 : 30)
      .when(Boolean(this.help), (el) => el.items_start().pt(5))
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        const m = e.modifiers;
        if (m.platform || m.alt) return;
        if (helpKey(this, e)) return cx.stop_propagation(), cx.notify();
        if (e.key === "escape" || (e.key === "q" && !m.control)) return closeOverlay(props().overlay);
        const name = moveOf(e.key, m.control && !m.shift, m.shift);
        if (!name) return;
        this.go(name, cx);
        cx.stop_propagation();
      })
      .px(10)
      .gap(10)
      .when(!this.help, (el) => el.items_center())
      .text_size(12)
      .child(chip("SCROLL", t.accent))
      .child(div().flex_1().min_w(0).truncate().text_color(t.muted)
        .child(this.terminal ? "? keys · q quit" : "No terminal in focus · q quit"))
      .when(Boolean(this.help), (el) => el.child(keyPanel(t, [["KEYS", [
        ["j k ↓↑", "a line down, up; ^E ^Y ^N ^P too"], ["^D ^U", "half a page down, up; pgdn pgup too"],
        ["^F ^B", "a page down, up; space b too"], ["g G", "top, bottom; home end too"], ["q esc", "back to the bottom and quit"],
      ]]])));
  }
}

// Pixel HQ chrome. Each mh-* mod has an identical copy of this file (mods can't import each other).
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";

// A button, toggle or tab: rounded, a 1px frame, brighter when on.
export const button = (el, t, on) => el.rounded(6).border_1().border_color(on ? t.muted : t.input).bg(on ? t.raised : t.chrome);

// An input or card frame.
export const frame = (el, border, fill) => el.rounded(6).border_1().border_color(border).bg(fill);

// A tinted pill; `icon` goes before the text.
export const chip = (text, color, icon) => {
  const c = color.slice(0, 7);
  return h_flex().flex_none().gap(4).px(6).h(18).items_center().rounded(6).border_1().border_color(c + "66").bg(c + "22")
    .text_size(10).font_bold().text_color(color).when(Boolean(icon), (el) => el.child(icon)).child(text);
};

export const spinner = (size = 12) => svg("mods/mh-spaces/px-spinner.svg").size(size).flex_none().spin(900);

// An agent's status: the spinner, a bang or a tick; nothing when idle.
export const mark = (status, t, size = 12) =>
  status === "working" ? spinner(size).text_color(t.working)
  : status === "blocked" ? svg("mods/mh-spaces/px-bang.svg").size(Math.round(size * 0.75)).flex_none().text_color(t.blocked)
  : status === "done" ? svg("mods/mh-spaces/px-tick.svg").size(Math.round(size * 0.9)).flex_none().text_color(t.done)
  : null;

// The words for a status, the same everywhere.
export const WORDS = { blocked: "needs you", working: "working", done: "done", idle: "idle" };

// Text that reads on a fill: dark on light colors, light on dark ones.
export const ink = (fill) => {
  const n = parseInt(fill.slice(1, 7), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150 ? "#11111b" : "#ffffff";
};

// The ? panel: a dialog's keys and what its marks mean, over the dialog. sections: [[TITLE, [[left, text], ...]], ...];
// left is a key as text, or an element drawing the mark. Its element is the dialog's root child (the root is relative()).
export const keyPanel = (t, sections) => {
  const row = (left, text) => h_flex().h(24).gap(12).items_center()
    .child(h_flex().w(112).flex_none().child(typeof left === "string" ? div().text_size(12).font_semibold().text_color(t.foreground).child(left) : left))
    .child(div().text_size(12).text_color(t.muted).child(text));
  return div().absolute().top(0).left(0).right(0).bottom(0).flex().items_center().justify_center().bg("#00000055")
    .child(frame(v_flex(), t.input, t.popover).id("key-panel").max_w(560).p(16).gap(2)
      .children(sections.flatMap(([title, rows]) => [div().pt(6).text_size(11).font_semibold().text_color(t.dim).child(title), ...rows.map(([l, x]) => row(l, x))]))
      .child(div().pt(8).text_size(11).text_color(t.dim).child("? or esc closes")));
};

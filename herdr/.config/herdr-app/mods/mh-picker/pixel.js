// Pixel HQ chrome. Each mh-* mod has an identical copy of this file (mods can't import each other).
import { svg } from "gpui-kit";
import { h_flex } from "gpui-base";

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

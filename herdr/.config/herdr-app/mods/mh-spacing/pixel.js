// Pixel HQ chrome. Each mh-* mod has an identical copy of this file (mods can't import each other).
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";

export const button = (el, t, on) => el.rounded(6).border_1().border_color(on ? t.muted : t.input).bg(on ? t.raised : t.chrome);

export const frame = (el, border, fill) => el.rounded(6).border_1().border_color(border).bg(fill);

export const chip = (text, color, icon) => {
  const c = color.slice(0, 7);
  return h_flex().flex_none().gap(4).px(6).h(18).items_center().rounded(6).border_1().border_color(c + "66").bg(c + "22")
    .text_size(10).font_bold().text_color(color).when(Boolean(icon), (el) => el.child(icon)).child(text);
};

export const spinner = (size = 12) => svg("mods/mh-spaces/px-spinner.svg").size(size).flex_none().spin(900);

export const mark = (status, t, size = 12) =>
  status === "working" ? spinner(size).text_color(t.working)
  : status === "blocked" ? svg("mods/mh-spaces/px-bang.svg").size(Math.round(size * 0.75)).flex_none().text_color(t.blocked)
  : status === "done" ? svg("mods/mh-spaces/px-tick.svg").size(Math.round(size * 0.9)).flex_none().text_color(t.done)
  : null;

export const statusMarks = (t) => h_flex().gap(6).items_center().children(["working", "blocked", "done"].map((s) => mark(s, t)));

export const WORDS = { blocked: "needs you", working: "working", done: "done", idle: "idle" };

export const ink = (fill) => {
  const n = parseInt(fill.slice(1, 7), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150 ? "#11111b" : "#ffffff";
};

// sections: [[TITLE, [[left, text], ...]]]; left is a key as text or an element drawing the mark. The dialog root is relative().
export const keyPanel = (t, sections) => {
  const row = (left, text) => h_flex().h(24).gap(12).items_center()
    .child(h_flex().w(112).flex_none().child(typeof left === "string" ? div().text_size(12).font_semibold().text_color(t.foreground).child(left) : left))
    .child(div().text_size(12).text_color(t.muted).child(text));
  return div().absolute().top(0).left(0).right(0).bottom(0).flex().items_center().justify_center().bg("#00000055")
    .child(frame(v_flex(), t.input, t.popover).id("key-panel").max_w(560).p(16).gap(2)
      .children(sections.flatMap(([title, rows]) => [div().pt(6).text_size(11).font_semibold().text_color(t.dim).child(title), ...rows.map(([l, x]) => row(l, x))]))
      .child(div().pt(8).text_size(11).text_color(t.dim).child("? or esc closes")));
};

export const isHelpKey = (e) => (e.key === "?" || (e.key === "/" && e.modifiers.shift)) && !e.modifiers.control && !e.modifiers.platform;

// On a search field ? opens only while it is `empty`; ? or esc gives the keyboard back to `field`. True when the key was the panel's.
export function helpKey(view, e, field, empty = true) {
  if (!view.help && !(isHelpKey(e) && empty)) return false;
  if (!view.help || e.key === "escape" || isHelpKey(e)) {
    view.help = !view.help;
    (view.help || !field ? view.handle : field).focus();
  }
  return true;
}

// Tab and shift-tab would move the keyboard to a field under the ? panel: its key context takes them while it shows.
export function bindPanelKeys(cx) {
  try {
    cx.bind_keys(["tab", "shift-tab"].map((keystroke) => ({ keystroke, action: "mh_key_panel", context: "MhKeyPanel" })));
  } catch {}
}
export const panelKeys = (el, on) => el.when(on, (el) => el.key_context("MhKeyPanel").on_action("mh_key_panel", () => {}));

export const action = (t, id, text, primary, click) => button(div(), t, false).id(id).flex_none().px(13).py(5).cursor_pointer()
  .when(primary, (el) => el.border_color(t.accent).bg(t.solid)).text_color(primary ? t.solid_foreground : t.muted)
  .text_size(11.5).font_semibold().when(!primary, (el) => el.hover((s) => s.text_color(t.foreground))).on_click(click).child(text.toUpperCase());

// By the theme, not the Mac's mode: this layout's theme is dark in both.
export const darkOf = (t) => ink(t.background) === "#ffffff";


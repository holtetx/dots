// Pixel HQ chrome as its preview shows it: soft rounded boxes with a thin frame, drawn as absolute blocks.
// Mods can't import each other, so each mh-* mod that draws these has a copy of this file: keep them the same.
import { div, svg } from "gpui-kit";

// A rounded block. Insets are [left, right, top, bottom].
export const notch = (c, [l, r, t, b], radius = 4) => [div().absolute().left(l).right(r).top(t).bottom(b).rounded(radius).bg(c)];

// A button or tab: a 1px frame around a fill. Its element is relative() and takes these as its first
// children. The 2px it leaves on the right and bottom keeps the old shadow's room, so callers keep their padding.
export const box = (frame, fill, _shadow) => [
  ...notch(frame, [0, 2, 0, 2], 6),
  ...notch(fill, [1, 3, 1, 3], 5),
];

// A field (an input, a card): a 1px frame around a fill.
export const field = (frame, fill) => [...notch(frame, [0, 0, 0, 0], 6), ...notch(fill, [1, 1, 1, 1], 5)];

// A chip: a tinted pill with a 1px outline. Its element is relative() and takes these first.
export const outline = (color) => {
  const c = color.slice(0, 7);
  return [div().absolute().left(0).right(0).top(0).bottom(0).rounded(6).border_1().border_color(c + "66").bg(c + "22")];
};

// The working loader: a ring of pixels that turns.
export const spinner = (size = 12) => svg("mods/mh-spaces/px-spinner.svg").size(size).flex_none().spin(900);

// A pane's header, cloned from Herdr's pane mod. The session chip shows only in a split: the tab already shows it.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { chip, mark, WORDS } from "./pixel.js";
import { track } from "./stats.js";
import { panes, props, run, theme, home, layout, terminals } from "herdr";

// Match the first visible tab frame, including the active child of a stack.
function paneFrame(node) {
  if (!node || node.hidden) return null;
  if (node.content?.tab && node.content.pane) return node.content.pane;
  let children = node.children ?? [];
  if (node.type === "stack") {
    const visible = children.filter(child => !child.hidden);
    children = [visible.find(child => child.id === node.active) ?? visible[0]];
  }
  for (const child of children) {
    const frame = paneFrame(child);
    if (frame) return frame;
  }
  return null;
}

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

// Same as mh-toast (mods can't import each other): the title when it says more than the program, a path or user@host.
const clean = (s) => (s ?? "").replace(/^(?:\[ [!.] \] |[✋⏳]️?(?=\s)|(?!(?:\p{Emoji}️|[#*]⃣))[^\p{L}\p{N}\p{Ps}\p{Pi}\p{Emoji_Presentation}])+/u, "").trim();
function telling(p) {
  const live = clean(p.title);
  const path = /^(?:[~/]|[A-Za-z]:\\)\S*$/.test((p.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  return live && live !== p.terminal && live !== p.program?.name && !path && !live.includes("@") && live.toLowerCase() !== p.program?.key ? live : null;
}

export default class Pane extends View {
  init() { this.hovered = false; }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  button(t, id, icon, command, args) {
    return div()
      .id(id)
      .p(3)
      .rounded(6)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        track(`mh-pane.${icon}`, "click");
        run(command, args);
      })
      .child(svg(`mods/mh-pane/${icon}.svg`).size(14));
  }

  render() {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const agent = Boolean(p.program?.agent);
    const name = p.name || ((agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const split = panes().filter((x) => x.tab === p.tab).length > 1;
    const session = agent && split ? (terminals().find((x) => x.address === p.terminal)?.labels?.["mh.description"] || telling(p)) : null;
    const pic = icon(p.program, 14, t.dim);
    const st = p.status;
    const color = t[st] ?? t.dim;
    const pane = p.pane;
    const bottom = paneFrame(layout())?.header?.position === "bottom";
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      .bg(t.background)
      .when(bottom, el => el.border_t(1))
      .when(!bottom, el => el.border_b(1))
      .border_color(t.border)
      .text_size(12)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(200).font_semibold().text_color(t.foreground).child(name))
      .when(Boolean(session), (el) => el.child(div().min_w(0).flex_shrink(1).child(chip(session, "#b4befe").max_w(360).truncate())))
      .child(div().id(`ph-where-${pane}`).flex_1().min_w(0).truncate().text_color(t.dim).tooltip([folder(p.cwd), p.branch].filter(Boolean).join(" · "))
        .child(folder(p.cwd)))
      .when(this.hovered, el => el
        .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane })))
      .when(Boolean(st), (el) => el.child(chip(WORDS[st].toUpperCase(), color, mark(st, t, 11))));
  }
}

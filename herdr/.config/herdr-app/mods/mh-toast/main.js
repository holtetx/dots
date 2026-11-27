// Herdr's agent toasts name only the program and "<space> / <tab>": find the agent to say which session.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, agents, terminals, panes } from "herdr";

const LEVEL = { error: "blocked", warning: "working", success: "done", info: "accent" };
const STATUS = [[/ needs you$/, "Needs you", "blocked"], [/ finished$/, "Finished", "done"]];

// The agent the toast is about: its click target, else its "<space> / <tab>" body.
function agentOf(p) {
  const all = agents();
  const address = p.action?.args?.terminal;
  if (address) return all.find((a) => a.address === address);
  const m = /^(.*) \/ (.+)$/.exec(p.body ?? "");
  // Spaces can share a name: guess only when one agent fits.
  const hits = m ? all.filter((a) => a.space_name === m[1] && [a.tab_name, String(a.tab_index)].includes(m[2])) : [];
  return hits.length === 1 ? hits[0] : null;
}

// Copied from mh-spaces/title.js: a mod can not import from another mod's folder.
// Drops what an agent puts before its title: a status glyph or spinner and the separator
// after it ("✦  Working", "⠋ - Thinking"), and Codex's blinking "[ ! ] " / "[ . ] " mark.
// Stops at an opening bracket or quote, so a title that starts with one ("[web] login") keeps it,
// and at an emoji ("🔴 login", "❤️ deploy"), except for known status marks.
const clean = (s) => (s ?? "").replace(/^(?:\[ [!.] \] |[✋⏳]️?(?=\s)|(?!(?:\p{Emoji}️|[#*]⃣))[^\p{L}\p{N}\p{Ps}\p{Pi}\p{Emoji_Presentation}])+/u, "").trim();

// The agent's title when it says more than the program, a path or user@host.
function telling(a) {
  const live = clean(a?.title);
  // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  // No spaces, so a slash command ("/review-all with x") is a title, not a path.
  const path = /^(?:[~/]|[A-Za-z]:\\)\S*$/.test((a?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  return live && live !== a?.address && live !== a?.program?.name && !path && !live.includes("@") && live.toLowerCase() !== a?.program?.key ? live : null;
}

const titleOf = (a) => terminals().find((t) => t.address === a.address)?.labels?.["mh.description"] || telling(a);

export default class Toast extends View {
  render() {
    const t = theme();
    const p = props() ?? {};
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;
    const status = STATUS.find(([re]) => re.test(p.title ?? ""));
    const a = status ? agentOf(p) : null;
    const title = (a && titleOf(a)) ?? p.title ?? "";
    const color = t[status?.[2] ?? LEVEL[p.level] ?? "accent"];
    const branch = a && panes().find((x) => x.pane === a.pane)?.branch;
    const prog = a?.program;
    const text = (value) => p.fitHeight
      ? div().child(value)
      : div().truncate().child(typeof value === "string" ? value.split("\n", 1)[0] : value);
    const icon = p.icon ? image(p.icon).w(18).h(18).flex_none()
      : prog?.icon ? (prog.tint ? svg(prog.icon).size(18).flex_none().text_color(t.foreground) : image(prog.icon).w(18).h(18).flex_none())
      : div().size(8).rounded(4).flex_none().bg(color);
    const detail = a
      ? h_flex().gap(6).text_size(12).text_color(t.muted).overflow_hidden()
        .child(div().flex_none().text_color(color).font_semibold().child(status[1]))
        .child(div().flex_none().child("·"))
        .child(div().min_w(0).truncate().child(a.space_name))
        .when(Boolean(branch), (el) => el.child(div().flex_none().child("·")).child(div().min_w(0).truncate().child(branch)))
      : p.body && !login ? text(p.body).text_size(12).text_color(t.muted) : null;
    return h_flex()
      .id("toast")
      .when(p.fitHeight, (el) => el.w_full().min_h(70).flex_none())
      .when(!p.fitHeight, (el) => el.size_full())
      .items_stretch()
      .bg(t.popover)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        closeOverlay(p.overlay);
      })
      .child(div().w(3).flex_none().bg(color))
      .child(h_flex().flex_1().min_w(0).px(16).py(12).gap(12).items_center()
        .child(icon)
        .child(
          v_flex()
            .flex_1()
            .gap(2)
            .overflow_hidden()
            .child(text(login ? `${login[1]} needs a login: run` : title).font_semibold().text_size(13).text_color(t.foreground))
            .when(Boolean(detail), (el) => el.child(detail))
            .when(Boolean(login), (el) => el.child(h_flex().gap(8).items_center()
              .child(div().flex_1().min_w(0).truncate().tooltip(command).text_size(12).text_color(t.muted).child(command))
              .child(div().id("toast-login-copy").flex_none().px(6).py(3).rounded(4).bg(t.raised)
                .text_size(12).text_color(t.foreground).cursor_pointer().hover(s => s.bg(t.hover))
                .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(command); this.copied = true; cx.notify(); })
                .child(this.copied ? "Copied" : "Copy")))),
        ));
  }
}

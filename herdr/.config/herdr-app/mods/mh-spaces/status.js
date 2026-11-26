// The status list (s on a Jira card, on the board or in its preview): the moves Jira's workflow
// allows from the issue's status. ↵ makes one, sets shared("jira.moved") and closes; esc closes.
// Its own dialog, so esc never reaches the board under it.
// A mh-spaces overlay with props { status: key, url, title, back }.

import { div } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { props, closeOverlay, openOverlay, setShared, theme } from "herdr";
import { jiraTransition, jiraTransitions } from "./jira-data.js";

// back: the shared key set when it closes, so the view under it takes the keyboard back.
export const openStatus = (it, back) => openOverlay({ mod: "mh-spaces", kind: "dialog", width: 460, height: 320, props: { status: it.key, url: it.url, title: it.title ?? "", back } });

export function statusInit(view, cx) {
  const issue = props().status;
  view.handle = cx.focus_handle();
  view.handle.focus();
  view.scroll = ScrollHandle.new();
  view.rows = [];
  view.at = 0;
  view.note = "Asking Jira…";
  view.moving = false;
  cx.spawn(async (cx) => {
    try {
      view.rows = await jiraTransitions(issue);
      view.note = view.rows.length ? "" : "Jira allows no move from this status.";
    } catch (e) {
      view.note = String(e?.message ?? e);
    }
    cx.notify();
  });
}

function move(view, cx) {
  const row = view.rows[view.at];
  if (!row || view.moving) return;
  const { status: issue, url, overlay } = props();
  view.moving = true;
  view.note = `Moving to ${row.to}…`;
  cx.spawn(async (cx) => {
    try {
      await jiraTransition(issue, row.id);
      setShared("jira.moved", { key: issue, url, to: row.to, at: Date.now() });
      closeOverlay(overlay);
    } catch (e) {
      view.note = String(e?.message ?? e);
      view.moving = false;
      cx.notify();
    }
  });
}

function key(view, e, cx) {
  const m = e.modifiers;
  if (m.control || m.alt || m.platform) return false;
  if (e.key === "escape") return closeOverlay(props().overlay), true;
  if (e.key === "enter") return move(view, cx), true;
  const by = { j: 1, down: 1, k: -1, up: -1 }[e.key];
  if (!by) return false;
  view.at = Math.max(0, Math.min(view.rows.length - 1, view.at + by));
  view.scroll.scroll_to_item(view.at);
  return true;
}

export function statusRender(view) {
  const t = theme();
  const { status: issue, title } = props();
  return v_flex()
    .id("status")
    .track_focus(view.handle)
    .on_key_down((e, cx) => {
      if (!key(view, e, cx)) return;
      cx.stop_propagation();
      cx.notify();
    })
    .size_full()
    .min_h(0)
    .p(14)
    .gap(8)
    .bg(t.popover)
    .text_size(12.5)
    .child(div().flex_none().truncate().font_semibold().text_color(t.foreground).child(`Move ${issue} ${title}`))
    .when(Boolean(view.note), (el) => el.child(div().flex_none().text_color(t.muted).child(view.note)))
    .child(v_flex().id("status-list").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(view.scroll)
      .children(view.rows.map((r, i) => h_flex().id(`st-${r.id}`).h(28).flex_none().px(10).gap(10).items_center().rounded(6).cursor_pointer()
        .when(i === view.at, (el) => el.bg(t.selected))
        .when(i !== view.at, (el) => el.hover((s) => s.bg(t.hover)))
        .on_click((e, cx) => {
          view.at = i;
          if (e.click_count >= 2) move(view, cx);
          cx.notify();
        })
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(r.name))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(r.to === r.name ? "" : `→ ${r.to}`)))))
    .child(h_flex().flex_none().justify_end().text_size(11).text_color(t.dim).child("j k choose · ↵ move · esc back"));
}

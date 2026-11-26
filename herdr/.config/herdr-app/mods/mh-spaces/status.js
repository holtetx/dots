// The status dialog (s on a Jira card or in its preview; openStatus in board.js): the statuses
// Jira's workflow allows a move to. 1-9 or ↵ makes one, sets shared("jira.moved") and closes.
// Its own dialog, so esc never reaches the board under it.
// A mh-spaces overlay with props { status: key, url, title, from: { id, name, category }, back }.

import { div } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { props, closeOverlay, setShared, settings, theme } from "herdr";
import { jiraTransition, jiraTransitions } from "./jira-data.js";
import { statusChip } from "./board.js";

export function statusInit(view, cx) {
  const { status: issue, from } = props();
  view.handle = cx.focus_handle();
  view.handle.focus();
  view.scroll = ScrollHandle.new();
  view.rows = [];
  view.at = 0;
  view.note = "Asking Jira…";
  view.failed = false;
  view.moving = false;
  cx.spawn(async (cx) => {
    try {
      // A move to the status it has changes nothing on the board: the header shows that one.
      view.rows = (await jiraTransitions(issue)).filter((r) => r.toId !== from?.id);
      view.note = view.rows.length ? "" : "Jira allows no move from this status.";
    } catch (e) {
      view.note = String(e?.message ?? e);
      view.failed = true;
    }
    cx.notify();
  });
}

function move(view, cx) {
  const row = view.rows[view.at];
  if (!row || view.moving) return;
  const { status: issue, url, overlay } = props();
  view.moving = true;
  view.failed = false;
  view.note = `Moving to ${row.to}…`;
  cx.spawn(async (cx) => {
    try {
      await jiraTransition(issue, row.id);
      setShared("jira.moved", { key: issue, url, to: row.to, at: Date.now() });
      closeOverlay(overlay);
    } catch (e) {
      view.note = String(e?.message ?? e);
      view.failed = true;
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
  if (/^[1-9]$/.test(e.key) && view.rows[Number(e.key) - 1]) return (view.at = Number(e.key) - 1), move(view, cx), true;
  const by = { j: 1, down: 1, k: -1, up: -1 }[e.key];
  if (!by) return false;
  view.at = Math.max(0, Math.min(view.rows.length - 1, view.at + by));
  view.scroll.scroll_to_item(view.at);
  return true;
}

export function statusRender(view) {
  const t = theme();
  const dark = Boolean(settings()?.dark);
  const { status: issue, title, from } = props();
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
    .p(16)
    .gap(12)
    .bg(t.popover)
    .text_size(12.5)
    .child(v_flex().flex_none().gap(8)
      .child(div().truncate().text_size(11.5).text_color(t.dim).child(`${issue} · ${title}`))
      .child(h_flex().gap(8).items_center()
        .child(div().font_semibold().text_color(t.foreground).child("Move from"))
        .when(Boolean(from?.name), (el) => el.child(statusChip(from.name, from.category, t, dark)))))
    .child(div().flex_none().h(1).bg(t.border))
    .when(Boolean(view.note), (el) => el.child(div().flex_none().text_color(view.failed ? t.blocked : t.muted).child(view.note)))
    .child(v_flex().id("status-list").flex_1().min_h(0).gap(2).overflow_y_scrollbar().track_scroll(view.scroll)
      .children(view.rows.map((r, i) => h_flex().id(`st-${r.id}`).h(32).flex_none().px(10).gap(12).items_center().rounded(6).cursor_pointer()
        .when(i === view.at, (el) => el.bg(t.selected))
        .when(i !== view.at, (el) => el.hover((s) => s.bg(t.hover)))
        .on_click((e, cx) => {
          view.at = i;
          if (e.click_count >= 2) move(view, cx);
          cx.notify();
        })
        .child(div().w(10).flex_none().text_size(11).text_color(t.dim).child(i < 9 ? String(i + 1) : ""))
        .child(statusChip(r.to, r.category, t, dark))
        .when(r.name !== r.to, (el) => el.child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(r.name))))))
    .child(h_flex().flex_none().justify_end().text_size(11).text_color(t.dim).child("1-9 or j k ↵ move · esc back"));
}

// The create dialog (n on the Jira tab), a mh-spaces overlay { create: project key, columns: [{ name, statuses }], col, back }.

import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { props, closeOverlay, setShared, theme } from "herdr";
import { createJiraIssue } from "./jira-data.js";
import { action, button, frame, keyPanel } from "./pixel.js";

const ASSIGNEES = ["No one", "Me"];
// Tab stops: the two text fields, then the two chip rows on the dialog's own focus.
// view.stop changes only on tab and clicks: the fields' focus events don't match the caret.
const STOPS = 4;

export function createInit(view, cx) {
  // Tab and shift-tab move app focus before on_key_down: our own bindings, deeper in, come first.
  try {
    cx.bind_keys([
      { keystroke: "tab", action: "mh_create_next", context: "MhCreate" },
      { keystroke: "shift-tab", action: "mh_create_prev", context: "MhCreate" },
    ]);
  } catch {}
  view.handle = cx.focus_handle();
  view.title = InputState.new({ placeholder: "Title" });
  view.title.on("submit", (_e, cx) => create(view, cx));
  view.text = TextareaState.new({ placeholder: "Description (plain text)", rows: 6 });
  view.text.on("submit", (e, cx) => e.secondary && create(view, cx));
  view.me = false;
  view.col = props().col ?? 0;
  view.note = "";
  view.failed = false;
  view.busy = false;
  view.created = null;
  view.stop = 0;
  view.title.focus();
}

const focusOf = (view) => [view.title, view.text, view.handle, view.handle][view.stop];

function go(view, stop) {
  view.stop = (stop + STOPS) % STOPS;
  focusOf(view).focus();
}

function create(view, cx) {
  if (view.busy) return;
  if (view.created) return closeOverlay(props().overlay);
  const title = view.title.value().trim();
  if (!title) {
    view.note = "Give it a title.";
    view.failed = true;
    return go(view, 0), cx.notify();
  }
  const { create: project, columns, overlay } = props();
  const column = columns[view.col];
  view.busy = true;
  view.failed = false;
  view.note = "Creating…";
  cx.notify();
  cx.spawn(async (cx) => {
    try {
      const r = await createJiraIssue({ project, title, description: view.text.value(), me: view.me, column });
      setShared("jira.moved", { key: r.key, url: r.url, to: column.name, created: true, note: r.note ?? `${r.key} created in ${column.name}.`, at: Date.now() });
      if (!r.note) return closeOverlay(overlay);
      view.created = r.key;
      view.note = r.note;
      view.failed = true;
    } catch (e) {
      view.note = String(e?.message ?? e);
      view.failed = true;
    }
    view.busy = false;
    cx.notify();
  });
}

function key(view, e, cx) {
  const m = e.modifiers;
  // The ? panel takes every key; ? or esc closes it.
  if (view.help) {
    if (e.key === "escape" || e.key === "?" || (e.key === "/" && m.shift)) (view.help = false), go(view, view.stop);
    return true;
  }
  // ? types in a field with text.
  if ((e.key === "?" || (e.key === "/" && m.shift)) && !m.control && !m.platform && !(view.stop < 2 && focusOf(view).value())) return (view.help = true), view.handle.focus(), true;
  if (e.key === "escape") return closeOverlay(props().overlay), true;
  if (e.key === "enter" && m.platform) return create(view, cx), true;
  if (view.stop < 2 || m.control || m.alt || m.platform) return false;
  if (e.key === "enter") return create(view, cx), true;
  const by = { h: -1, left: -1, l: 1, right: 1 }[e.key];
  if (!by) return false;
  if (view.stop === 2) view.me = by > 0;
  else view.col = Math.max(0, Math.min(props().columns.length - 1, view.col + by));
  return true;
}

export function createRender(view) {
  const t = theme();
  const { create: project, columns } = props();
  const chip = (id, text, on, click) => button(div(), t, on).id(id).flex_none().px(9).py(4).cursor_pointer().text_size(12)
    .text_color(on ? t.foreground : t.muted)
    .when(!on, (el) => el.hover((s) => s.text_color(t.foreground)))
    .on_click(click).child(text);
  const row = (stop, label, chips) => h_flex().flex_none().gap(10).items_start()
    .child(div().w(70).flex_none().py(3).text_size(11.5).text_color(view.stop === stop ? t.foreground : t.dim).child(label))
    .child(h_flex().flex_1().min_w(0).flex_wrap().gap(6).children(chips));
  return v_flex()
    .id("create")
    .track_focus(view.handle)
    .key_context("MhCreate")
    .on_action("mh_create_next", (_e, cx) => view.help || (go(view, view.stop + 1), cx.notify()))
    .on_action("mh_create_prev", (_e, cx) => view.help || (go(view, view.stop - 1), cx.notify()))
    .on_key_down((e, cx) => {
      if (!key(view, e, cx)) return;
      cx.stop_propagation();
      cx.notify();
    })
    .size_full()
    .relative()
    .min_h(0)
    .p(16)
    .gap(12)
    .bg(t.popover)
    .text_size(12.5)
    .child(div().flex_none().font_semibold().text_color(t.foreground).child(`NEW TASK IN ${project}`))
    .child(div().id("create-title").flex_none().on_mouse_down("left", (_e, cx) => { view.stop = 0; cx.notify(); }).child(frame(Input.new(view.title), view.stop === 0 ? t.accent : t.input, t.background).h(30).px(11).flex_none().text_color(t.foreground)))
    .child(v_flex().id("create-text").flex_1().min_h(90).on_mouse_down("left", (_e, cx) => { view.stop = 1; cx.notify(); }).child(frame(Textarea.new(view.text), view.stop === 1 ? t.accent : t.input, t.background).flex_1().px(11).py(8).text_color(t.foreground)))
    .child(row(2, "Assignee", ASSIGNEES.map((a, i) => chip(`create-who-${i}`, a, view.me === (i === 1), (_e, cx) => { view.me = i === 1; go(view, 2); cx.notify(); }))))
    .child(row(3, "Column", columns.map((c, i) => chip(`create-col-${i}`, c.name, view.col === i, (_e, cx) => { view.col = i; go(view, 3); cx.notify(); }))))
    .when(Boolean(view.note), (el) => el.child(div().flex_none().text_color(view.failed ? t.blocked : t.muted).child(view.note)))
    .child(h_flex().flex_none().gap(8).items_center()
      .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child("⌘↵ create · ? keys · esc close"))
      .child(action(t, "create-cancel", "Cancel", false, () => closeOverlay(props().overlay)))
      .child(action(t, "create-ok", view.created ? "Close" : view.busy ? "Creating…" : "Create", true, (_e, cx) => create(view, cx))))
    .when(Boolean(view.help), (el) => el.child(keyPanel(t, [["KEYS", [
      ["tab ⇧tab", "next, previous field"], ["h l ← →", "choose an assignee or column"], ["↵", "create, from the title or the choices"],
      ["⌘↵", "create, from anywhere"], ["?", "this list, in an empty field"], ["esc", "close"],
    ]]])));
}

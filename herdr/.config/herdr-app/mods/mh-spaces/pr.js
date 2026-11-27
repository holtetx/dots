// The side panel's PR tab: the shown space's PR status and its CI checks by workflow, and FIX, which asks the space's Claude to fix a failed check.
// In mh-spaces, as the git bar, to reuse the PR lookup, badge() and the board's and preview's status words.

import { div, svg } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { agents, focused, hc, layout, nextCommand, notify, run, setShared, shared, theme, window as appWindow } from "herdr";
import { CHECK_LOOK, FINAL, GH, REVIEW_FIELDS, badge, graphql, open, reviewsOf, spacePr, stateOf } from "./github.js";
import { CHECKS, checksOf, countLine, fixPrompt, groupsOf, splitName, took, worst } from "./checks-data.js";
import { find } from "./find.js";
import { GREEN, RED } from "./jira.js";
import { button, chip, darkOf, helpKey } from "./pixel.js";
import { pick, verdict } from "./board.js";
import { MERGE } from "./preview-data.js";
import { mergeChip } from "./preview.js";

const EVERY = 30000;
const STATUS = `state isDraft isInMergeQueue reviewDecision mergeStateStatus headRefName baseRefName additions deletions ${REVIEW_FIELDS}`;

// The status line's facts, in the board's and the preview's words.
function statusOf(n) {
  const state = stateOf(n);
  return { state, review: n.reviewDecision ?? null, ...reviewsOf(n), merge: MERGE[n.mergeStateStatus] ?? null, branch: n.headRefName, base: n.baseRefName, added: n.additions ?? 0, deleted: n.deletions ?? 0 };
}

// The review word (or merged, closed) and the merge state as chips, then branch → base and the size.
function statusLines(st, t, dark) {
  const live = !FINAL.has(st.state);
  const [word, color] = live ? verdict(st, t, dark) : [GH[st.state].label, pick(GH[st.state].color, dark)];
  return v_flex().flex_none().px(16).pb(10).gap(6)
    .child(h_flex().gap(6).flex_wrap()
      .child(chip(word.toUpperCase(), color))
      .when(live && Boolean(st.merge), (el) => el.child(mergeChip(st.merge.toUpperCase(), t, dark))))
    .child(h_flex().min_w(0).gap(8).text_size(11).text_color(t.dim)
      .child(div().min_w(0).truncate().child(st.branch))
      .child(div().flex_none().child(`→ ${st.base}`))
      .child(div().flex_none().text_color(pick(GREEN, dark)).child(`+${st.added}`))
      .child(div().flex_none().text_color(pick(RED, dark)).child(`-${st.deleted}`)));
}

const shown = () => {
  const root = layout();
  return appWindow()?.visible !== false && !find(root, "panel")?.hidden && find(root, "panel-body")?.active === "pr";
};

// Where FIX goes: the focused Claude in the space, else the one that changed last.
function claudeIn(id) {
  const list = agents().filter((a) => a.space === id && a.program?.key === "claude");
  return list.find((a) => a.focused) ?? list.sort((a, b) => b.seq - a.seq)[0] ?? null;
}

export function prInit(view, cx) {
  view.prs = {}; // PR url -> { status, checks, at, error }
  view.sent = new Set(); // runs FIX was sent for (sentKey)
  view.open = new Map(); // "url\0workflow" -> folded or open by a click or key
  view.busy = false;
  view.handle = cx.focus_handle();
  view.scroll = ScrollHandle.new();
  view.sel = null; // the selected row's key (rowKey)
  view.rows = []; // the rows as last drawn
  view.focusSeen = shared("pr.focus");
  // Herdr's focus (its border, where alt-hjkl start) moves only with pane.go, which sends "focus" here.
  // Herdr has no command to focus a block, so ctrl-a p (shared("pr.focus"), also for a copy it just started)
  // and a click step pane.go right until it lands on this, the rightmost block.
  view.herdrFocus = false;
  view.tries = Date.now() - (view.focusSeen ?? 0) < 2000 ? 6 : 0;
  cx.timer.every(1000, (cx) => tick(view, cx));
  cx.timer.every(150, (cx) => {
    const ask = shared("pr.focus");
    if (ask !== view.focusSeen) { view.focusSeen = ask; view.tries = 6; }
    if (!view.handle.is_focused() && !view.tries) view.herdrFocus = false;
    if (view.tries > 0) view.tries = view.herdrFocus ? 0 : (run("pane.go", { direction: "right" }), view.tries - 1);
    if (view.handle.is_focused() !== view.wasFocused) { view.wasFocused = view.handle.is_focused(); cx.notify(); }
  });
  cx.spawn(async (cx) => {
    for (;;) if ((await nextCommand()) === "focus") { view.herdrFocus = true; view.handle.focus(); cx.notify(); }
  });
}

function tick(view, cx) {
  if (!shown()) return;
  const url = spacePr(focused()?.space);
  const d = url ? view.prs[url] : null;
  if (url && !view.busy && Date.now() - (d?.at ?? 0) >= EVERY) load(view, url, cx);
  // A running check's time goes up.
  if (d?.checks?.some((c) => c.state === "running")) cx.notify();
}

function load(view, url, cx) {
  view.busy = true;
  cx.spawn(async (cx) => {
    try {
      const n = (await graphql(`r: resource(url: ${JSON.stringify(url)}) { ... on PullRequest { ${STATUS} ${CHECKS} } }`))?.r;
      if (!n?.state) throw new Error("GitHub did not answer: is gh logged in, and can it see the repo?");
      const checks = checksOf(n);
      view.prs[url] = { status: statusOf(n), checks, at: Date.now() };
      // Newer than the sidebar's poll: the CHECKS button and git bar take it (bar.js).
      setShared("checks.fresh", { url, state: worst(checks), at: Date.now() });
    } catch (e) {
      view.prs[url] = { ...view.prs[url], error: String(e?.message ?? e), at: Date.now() };
    }
    view.busy = false;
    cx.notify();
  });
}

const sentKey = (c) => `${c.url}@${c.started}`;

function fix(view, c, prUrl, agent, cx) {
  view.sent.add(sentKey(c));
  cx.spawn(async (cx) => {
    const r = await hc(["send", agent.address, fixPrompt(c, prUrl)]).catch((e) => ({ code: 1, stderr: String(e?.message ?? e) }));
    if (r.code !== 0) {
      view.sent.delete(sentKey(c));
      notify({ title: "Couldn't send FIX to Claude", body: (r.stderr || "hc send failed").trim(), level: "error" });
    }
    cx.notify();
  });
}

function fixButton(view, c, id, prUrl, agent, t) {
  const sent = view.sent.has(sentKey(c));
  return button(div(), t, sent).id(`check-fix-${id}`).flex_none().h(22).px(8).flex().items_center()
    .text_size(10.5).font_bold().text_color(agent ? t.foreground : t.dim)
    .when(Boolean(agent), (el) => el.cursor_pointer().hover((s) => s.border_color(t.muted)))
    .when(!agent, (el) => el.opacity(0.5))
    .tooltip(!agent ? "No Claude in this space" : sent ? "Sent. Click to send again" : `Ask Claude in ${agent.tab_name || "this space"} to fix it`)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => { cx.stop_propagation(); if (agent) fix(view, c, prUrl, agent, cx); })
    .child(sent ? "SENT" : "FIX");
}

const mark = (state, t, dark) => svg(CHECK_LOOK[state].icon).size(14).flex_none().text_color(pick(CHECK_LOOK[state].color, dark));

// The tree line before a check, from its group's mark down.
const line = (t) => div().w(15).h_full().flex_none().ml(15).border_l_1().border_color(t.border);

function row(view, c, id, prUrl, agent, t, dark, on) {
  const end = c.ended ?? (c.state === "running" ? Date.now() : null);
  const [caller, own] = splitName(c.name);
  return h_flex().id(`check-${id}`).flex_none().h(30).items_center()
    .child(line(t))
    .child(h_flex().flex_1().min_w(0).h_full().px(8).gap(10).items_center().rounded(6).border_1().border_color(on ? t.accent : "#00000000")
      .when(on, (el) => el.bg(t.raised))
      .when(c.state === "skipped", (el) => el.opacity(0.6))
      .when(Boolean(c.url), (el) => el.cursor_pointer().hover((s) => s.bg(t.raised)).tooltip(`${c.name} · open the log`).on_click((_e, cx) => open(c.url, cx)))
      .child(mark(c.state, t, dark))
      .child(h_flex().flex_1().min_w(0).overflow_hidden()
        .when(Boolean(caller), (el) => el.child(div().flex_shrink(1).min_w(0).truncate().text_color(t.dim).child(caller)))
        .child(div().flex_none().max_w_full().truncate().text_color(t.foreground).child(own)))
      .when(Boolean(c.started && end) && c.state !== "skipped", (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(took(end - c.started))))
      .when(c.state === "failed", (el) => el.child(fixButton(view, c, id, prUrl, agent, t))));
}

// A workflow's header: a click folds or opens it.
function header(view, g, id, t, dark, on) {
  return h_flex().id(`check-group-${id}`).flex_none().h(30).px(8).gap(8).items_center().rounded(6).cursor_pointer()
    .border_1().border_color(on ? t.accent : "#00000000")
    .when(on, (el) => el.bg(t.raised))
    .hover((s) => s.bg(t.raised))
    .on_click((_e, cx) => { view.open.set(g.key, !g.opened); view.sel = g.key; cx.notify(); })
    .child(svg(`mods/workspace-chrome/chevron-${g.opened ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim))
    .child(mark(g.state, t, dark))
    .child(div().flex_1().min_w(0).truncate().text_size(11.5).font_semibold().text_color(t.foreground).child(g.name.toUpperCase()))
    .child(div().flex_none().text_size(11).text_color(t.dim).child(countLine(g.checks, " · ")));
}

// The list as rows: each workflow's header, then its checks while it's open. All passed or skipped starts folded.
function rowsOf(view, prUrl, checks) {
  return groupsOf(checks).flatMap((g) => {
    const key = `${prUrl}\0${g.name}`;
    const group = { ...g, key, opened: view.open.get(key) ?? (g.state === "failed" || g.state === "running") };
    return [{ key, group }, ...(group.opened ? g.checks.map((c) => ({ key: `${key}\0${c.name}`, group, check: c })) : [])];
  });
}

function select(view, i) {
  const r = view.rows[Math.max(0, Math.min(view.rows.length - 1, i))];
  if (!r) return;
  view.sel = r.key;
  view.scroll.scroll_to_item(view.rows.indexOf(r));
}

const PANE = { h: "left", j: "down", k: "up", l: "right" };

// True when the key was the panel's.
function key(view, e, cx) {
  if (helpKey(view, e, null)) return true;
  const m = e.modifiers;
  if (m.alt && PANE[e.key]) return run("pane.go", { direction: PANE[e.key] }), true;
  if (m.control || m.platform || m.alt) return false;
  const at = Math.max(0, view.rows.findIndex((r) => r.key === view.sel));
  const r = view.rows[at];
  const fold = (g, open) => { view.open.set(g.key, open); view.sel = g.key; };
  if (e.key === "escape") return run("pane.go", { direction: "left" }), true;
  if (e.key === "j" || e.key === "down") return select(view, at + 1), true;
  if (e.key === "k" || e.key === "up") return select(view, at - 1), true;
  if (e.key === "r") return view.url && !view.busy && load(view, view.url, cx), true;
  if (!r) return false;
  const g = r.group;
  if (e.key === "l" || e.key === "right") return r.check ? true : g.opened ? select(view, at + 1) : fold(g, true), true;
  if (e.key === "h" || e.key === "left") return r.check ? select(view, view.rows.findIndex((x) => x.key === g.key)) : fold(g, false), true;
  if (e.key === "z" || e.key === "space") return fold(g, !g.opened), true;
  if (e.key === "enter") return r.check ? open(r.check.url, cx) : fold(g, !g.opened), true;
  if (e.key === "f" && r.check?.state === "failed") {
    const agent = claudeIn(focused()?.space);
    if (agent) fix(view, r.check, view.url, agent, cx);
    return true;
  }
  return false;
}

const KEYS = [["j k  ↓ ↑", "next or previous row"], ["l  →", "open a workflow, or go to its first check"], ["h  ←", "fold a workflow, or go up to it"], ["z  space", "fold or open the workflow"], ["↵", "open the check's log"], ["f", "FIX: ask the space's Claude to fix a failed check"], ["r", "ask GitHub now"], ["esc", "back to the terminal"], ["alt-hjkl", "leave the panel"]];

// ? in the panel: the keys and marks in place of the list (keyPanel() is for dialogs, too wide here).
function helpList(t, dark) {
  const line = (left, text) => h_flex().gap(12).items_start()
    .child(h_flex().w(76).flex_none().h(18).items_center().child(left))
    .child(div().flex_1().min_w(0).text_color(t.muted).child(text));
  const title = (text) => div().pt(8).text_size(11).font_semibold().text_color(t.dim).child(text);
  return v_flex().id("checks-help").flex_1().min_h(0).px(16).pb(12).gap(6).overflow_y_scrollbar()
    .child(title("KEYS"))
    .children(KEYS.map(([k, text]) => line(div().font_semibold().text_color(t.foreground).child(k), text)))
    .child(title("MARKS"))
    .children(["failed", "running", "passed", "skipped"].map((st) => line(mark(st, t, dark), st)))
    .child(div().pt(8).text_size(11).text_color(t.dim).child("? or esc closes"));
}

export function prRender(view) {
  const t = theme(), dark = darkOf(t);
  const id = focused()?.space;
  const url = spacePr(id);
  view.url = url;
  const d = url ? view.prs[url] : null;
  const gh = shared("github") ?? {};
  const hasKeys = view.handle.is_focused();
  const note = (text, color = t.dim) => div().px(16).py(6).text_color(color).child(text);
  view.rows = url ? rowsOf(view, url, d?.checks ?? []) : [];
  if (view.rows.length && !view.rows.some((r) => r.key === view.sel)) view.sel = view.rows[0].key;
  const agent = url ? claudeIn(id) : null;
  return v_flex().id("pr").size_full().min_h(0).bg(t.chrome).text_size(12).text_color(t.muted)
    .track_focus(view.handle)
    .on_key_down((e, cx) => {
      if (!key(view, e, cx)) return;
      cx.stop_propagation();
      cx.notify();
    })
    .on_mouse_down("left", () => { view.handle.focus(); if (!view.herdrFocus) view.tries = 6; })
    .child(h_flex().h(31).flex_none().px(16).gap(8).items_center().text_size(11.5).text_color(t.dim)
      .child(div().font_semibold().child("PR"))
      .child(div().flex_1())
      .when(Boolean(d?.checks), (el) => el.child(div().truncate().child(countLine(d.checks) || "no checks")))
      .when(hasKeys, (el) => el.child(div().flex_none().pl(4).child("· ? keys"))))
    .when(!url, (el) => el.child(note("No PR for this space.")))
    .when(Boolean(url), (el) => el
      .child(h_flex().flex_none().px(16).pb(6).gap(8).items_center()
        .child(badge(url, gh.items ?? {}, t, "pr-badge"))
        .child(div().min_w(0).truncate().text_color(t.foreground).child(gh.items?.[url]?.title ?? "")))
      .when(Boolean(d?.status), (el) => el.child(statusLines(d.status, t, dark)))
      .when(Boolean(d?.error), (el) => el.child(note(d.error, pick(RED, dark))))
      .when(!d, (el) => el.child(note("Loading…")))
      .when(Boolean(d?.checks && !d.checks.length), (el) => el.child(note("No checks on the newest commit."))))
    .when(Boolean(view.help), (el) => el.child(helpList(t, dark)))
    .when(!view.help, (el) => el.child(v_flex().id("checks-list").flex_1().min_h(0).px(8).pb(8).overflow_y_scrollbar().track_scroll(view.scroll)
      .children(view.rows.map((r, i) => {
        const on = hasKeys && r.key === view.sel;
        return r.check ? row(view, r.check, i, url, agent, t, dark, on) : header(view, r.group, i, t, dark, on);
      }))));
}

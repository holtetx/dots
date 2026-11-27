// The side panel's CHECKS tab: CI checks of the shown space's PR by workflow, and FIX, which asks the space's Claude to fix a failed one.
// In mh-spaces, as the git bar, to reuse the PR lookup and badge().

import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, focused, hc, layout, notify, setShared, shared, theme, window as appWindow } from "herdr";
import { CHECK_LOOK, badge, graphql, open, spacePr } from "./github.js";
import { CHECKS, checksOf, countLine, fixPrompt, groupsOf, splitName, took, worst } from "./checks-data.js";
import { find } from "./find.js";
import { RED } from "./jira.js";
import { button, darkOf } from "./pixel.js";
import { pick } from "./board.js";

const EVERY = 30000;

const shown = () => {
  const root = layout();
  return appWindow()?.visible !== false && !find(root, "panel")?.hidden && find(root, "panel-body")?.active === "checks";
};

// Where FIX goes: the focused Claude in the space, else the one that changed last.
function claudeIn(id) {
  const list = agents().filter((a) => a.space === id && a.program?.key === "claude");
  return list.find((a) => a.focused) ?? list.sort((a, b) => b.seq - a.seq)[0] ?? null;
}

export function checksInit(view, cx) {
  view.prs = {}; // PR url -> { checks, at, error }
  view.sent = new Set(); // runs FIX was sent for (sentKey)
  view.open = new Map(); // "url\0workflow" -> folded or open by a click
  view.busy = false;
  cx.timer.every(1000, (cx) => tick(view, cx));
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
      const n = (await graphql(`r: resource(url: ${JSON.stringify(url)}) { ... on PullRequest { ${CHECKS} } }`))?.r;
      if (!n) throw new Error("GitHub did not answer: is gh logged in, and can it see the repo?");
      const checks = checksOf(n);
      view.prs[url] = { checks, at: Date.now() };
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

function row(view, c, id, prUrl, agent, t, dark) {
  const end = c.ended ?? (c.state === "running" ? Date.now() : null);
  const [caller, own] = splitName(c.name);
  return h_flex().id(`check-${id}`).flex_none().h(30).px(8).gap(10).items_center().rounded(6)
    .when(c.state === "skipped", (el) => el.opacity(0.6))
    .when(Boolean(c.url), (el) => el.cursor_pointer().hover((s) => s.bg(t.raised)).tooltip(`${c.name} · open the log`).on_click((_e, cx) => open(c.url, cx)))
    .child(mark(c.state, t, dark))
    .child(h_flex().flex_1().min_w(0).overflow_hidden()
      .when(Boolean(caller), (el) => el.child(div().flex_shrink(1).min_w(0).truncate().text_color(t.dim).child(caller)))
      .child(div().flex_none().max_w_full().truncate().text_color(t.foreground).child(own)))
    .when(Boolean(c.started && end) && c.state !== "skipped", (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(took(end - c.started))))
    .when(c.state === "failed", (el) => el.child(fixButton(view, c, id, prUrl, agent, t)));
}

// A workflow: its header (a click folds or opens it), then its checks on a tree line. All passed or skipped starts folded.
function group(view, g, gi, prUrl, agent, t, dark) {
  const key = `${prUrl}\0${g.name}`;
  const opened = view.open.get(key) ?? (g.state === "failed" || g.state === "running");
  return v_flex().flex_none()
    .child(h_flex().id(`check-group-${gi}`).h(30).px(8).gap(8).items_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.raised))
      .on_click((_e, cx) => { view.open.set(key, !opened); cx.notify(); })
      .child(svg(`mods/workspace-chrome/chevron-${opened ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim))
      .child(mark(g.state, t, dark))
      .child(div().flex_1().min_w(0).truncate().text_size(11.5).font_semibold().text_color(t.foreground).child(g.name.toUpperCase()))
      .child(div().flex_none().text_size(11).text_color(t.dim).child(countLine(g.checks, " · "))))
    .when(opened, (el) => el.child(v_flex().ml(14).pl(4).mb(4).border_l_1().border_color(t.border).gap(2)
      .children(g.checks.map((c, i) => row(view, c, `${gi}-${i}`, prUrl, agent, t, dark)))));
}

export function checksRender(view) {
  const t = theme(), dark = darkOf(t);
  const id = focused()?.space;
  const url = spacePr(id);
  const d = url ? view.prs[url] : null;
  const gh = shared("github") ?? {};
  const note = (text, color = t.dim) => div().px(16).py(6).text_color(color).child(text);
  const root = v_flex().size_full().min_h(0).bg(t.chrome).text_size(12).text_color(t.muted)
    .child(h_flex().h(31).flex_none().px(16).gap(8).items_center().text_size(11.5).text_color(t.dim)
      .child(div().font_semibold().child("CHECKS"))
      .child(div().flex_1())
      .when(Boolean(d?.checks), (el) => el.child(div().truncate().child(countLine(d.checks) || "no checks"))));
  if (!url) return root.child(note("No PR for this space."));
  const agent = claudeIn(id);
  return root
    .child(h_flex().flex_none().px(16).pb(8).gap(8).items_center()
      .child(badge(url, gh.items ?? {}, t, "checks-pr"))
      .child(div().min_w(0).truncate().text_color(t.foreground).child(gh.items?.[url]?.title ?? "")))
    .when(Boolean(d?.error), (el) => el.child(note(d.error, pick(RED, dark))))
    .when(!d, (el) => el.child(note("Loading…")))
    .when(Boolean(d?.checks && !d.checks.length), (el) => el.child(note("No checks on the newest commit.")))
    .child(v_flex().id("checks-list").flex_1().min_h(0).px(8).pb(8).gap(2).overflow_y_scrollbar()
      .children(groupsOf(d?.checks ?? []).map((g, gi) => group(view, g, gi, url, agent, t, dark))));
}

// The side panel's CHECKS tab: CI checks of the shown space's PR, and FIX, which asks the space's Claude to fix a failed one.
// In mh-spaces, as the git bar, to reuse the PR lookup and badge().

import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, focused, hc, layout, notify, shared, theme, window as appWindow } from "herdr";
import { badge, branchPr, graphql, open, prsOf } from "./github.js";
import { CHECKS, checksOf, countLine, fixPrompt, took } from "./checks-data.js";
import { find } from "./find.js";
import { GREEN, RED, YELLOW } from "./jira.js";
import { button, darkOf } from "./pixel.js";
import { pick } from "./board.js";

const EVERY = 30000;
const LOOK = {
  failed: ["mods/pr/circle-x.svg", RED],
  running: ["mods/pr/circle-dot.svg", YELLOW],
  passed: ["mods/pr/circle-check.svg", GREEN],
  skipped: ["mods/pr/circle-minus.svg", null],
};

const shown = () => {
  const root = layout();
  return appWindow()?.visible !== false && !find(root, "panel")?.hidden && find(root, "panel-body")?.active === "checks";
};

// The space's PR: its branch's, else its first open one.
function prOf(id) {
  const gh = shared("github") ?? {};
  const g = shared("git.spaces")?.[id];
  return (g && branchPr(id, g, gh)?.url) || (prsOf(id, gh).find((u) => gh.items?.[u]?.state === "open") ?? null);
}

// Where FIX goes: the focused Claude in the space, else the one that changed last.
function claudeIn(id) {
  const list = agents().filter((a) => a.space === id && a.program?.key === "claude");
  return list.find((a) => a.focused) ?? list.sort((a, b) => b.seq - a.seq)[0] ?? null;
}

export function checksInit(view, cx) {
  view.prs = {}; // PR url -> { checks, at, error }
  view.sent = new Set(); // runs FIX was sent for (sentKey)
  view.busy = false;
  cx.timer.every(1000, (cx) => tick(view, cx));
}

function tick(view, cx) {
  if (!shown()) return;
  const url = prOf(focused()?.space);
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
      view.prs[url] = { checks: checksOf(n), at: Date.now() };
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

function fixButton(view, c, i, prUrl, agent, t) {
  const sent = view.sent.has(sentKey(c));
  return button(div(), t, sent).id(`check-fix-${i}`).flex_none().h(22).px(8).flex().items_center()
    .text_size(10.5).font_bold().text_color(agent ? t.foreground : t.dim)
    .when(Boolean(agent), (el) => el.cursor_pointer().hover((s) => s.border_color(t.muted)))
    .when(!agent, (el) => el.opacity(0.5))
    .tooltip(!agent ? "No Claude in this space" : sent ? "Sent. Click to send again" : `Ask Claude in ${agent.tab_name || "this space"} to fix it`)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => { cx.stop_propagation(); if (agent) fix(view, c, prUrl, agent, cx); })
    .child(sent ? "SENT" : "FIX");
}

function row(view, c, i, prUrl, agent, t, dark) {
  const [icon, color] = LOOK[c.state];
  const end = c.ended ?? (c.state === "running" ? Date.now() : null);
  return h_flex().id(`check-${i}`).flex_none().min_h(36).px(8).py(4).gap(10).items_center().rounded(6)
    .when(c.state === "skipped", (el) => el.opacity(0.6))
    .when(Boolean(c.url), (el) => el.cursor_pointer().hover((s) => s.bg(t.raised)).tooltip("Open the log").on_click((_e, cx) => open(c.url, cx)))
    .child(svg(icon).size(14).flex_none().text_color(color ? pick(color, dark) : t.dim))
    .child(v_flex().flex_1().min_w(0)
      .child(div().truncate().text_color(t.foreground).child(c.name))
      .when(Boolean(c.workflow), (el) => el.child(div().truncate().text_size(11).text_color(t.dim).child(c.workflow))))
    .when(Boolean(c.started && end) && c.state !== "skipped", (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(took(end - c.started))))
    .when(c.state === "failed", (el) => el.child(fixButton(view, c, i, prUrl, agent, t)));
}

export function checksRender(view) {
  const t = theme(), dark = darkOf(t);
  const id = focused()?.space;
  const url = prOf(id);
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
      .children((d?.checks ?? []).map((c, i) => row(view, c, i, url, agent, t, dark))));
}

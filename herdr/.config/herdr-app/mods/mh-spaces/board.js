// The board (ctrl-a T): the open PRs in its repos and those involving you, and the open
// issues in its repos, both by repo. Each item shows how many
// Claude sessions, PRs and issues it's linked to: GitHub's own links and the other links
// of the sessions that had it.
// hjkl moves (^D/^U half a page, ^J/^K five); ↵ picks one of its sessions or
// starts one in its repo (mh-sessions' tasks list for that item), ⌃↵ opens
// it, ⌥↵ lists what it's linked to, space previews it (preview.js). What was fetched is kept for the next opening.
// A mh-spaces overlay with props { board: true }.

import { asks, stacked } from "./stack.js";
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { props, closeOverlay, openOverlay, theme, settings, shared, terminals, exec } from "herdr";
import { GH, FINAL, markRead, prKey, unknown } from "./github.js";
import { boardRepos, fetchIssues, fetchPrs } from "./board-data.js";

const FRESH = 2 * 60000;
const ICON = (name) => `mods/workspace-chrome/${name}.svg`;
const GREEN = ["#1a7f37", "#3fb950"], RED = ["#cf222e", "#f85149"], YELLOW = ["#9a6700", "#d29922"];
const CHECKS = { SUCCESS: ["check", GREEN, "Checks passed"], FAILURE: ["x", RED, "Checks failed"], ERROR: ["x", RED, "Checks failed"], PENDING: [null, YELLOW, "Checks running"], EXPECTED: [null, YELLOW, "Checks expected"] };
const KIND_ORDER = { pr: 0, issue: 1 };

// What was fetched, the tab shown and each tab's selection ({ url, i }),
// kept between openings (copies share this module).
const memory = { tab: "prs", sel: {}, data: {}, at: {}, errors: {}, stamps: {} };

export const ago = (ms) => {
  const d = (Date.now() - ms) / 1000;
  return d < 3600 ? `${Math.max(1, Math.round(d / 60))}m` : d < 86400 ? `${Math.round(d / 3600)}h` : d < 86400 * 60 ? `${Math.round(d / 86400)}d` : `${Math.round(d / 86400 / 30)}mo`;
};
const kindOf = (url, items) => items[url]?.kind ?? (/\/issues\/\d+/.test(url) ? "issue" : "pr");
const refOf = (it) => `${it.repo.split("/").pop()}#${it.number ?? "?"}`;

const tabsOf = () => [
  { id: "prs", name: "Pull requests" },
  { id: "issues", name: "Issues" },
];

export function boardInit(view, cx) {
  view.handle = cx.focus_handle();
  view.handle.focus();
  // The session picker over it gives the keyboard back when it closes (shared("board.focus")).
  view.focusAsk = shared("board.focus");
  cx.timer.every(150, () => {
    if (shared("board.focus") === view.focusAsk) return;
    view.focusAsk = shared("board.focus");
    view.handle.focus();
  });
  view.busy = {};
  view.note = "";
  view.picker = null;
  view.reveal = true;
  view.listScroll = ScrollHandle.new();
  view.pickScroll = ScrollHandle.new();
  refresh(view, cx, false);
}

function load(view, cx, key, stamp, work) {
  if (view.busy[key]) return;
  view.busy[key] = true;
  cx.spawn(async (cx) => {
    try {
      memory.data[key] = await work();
      memory.at[key] = Date.now();
      memory.stamps[key] = stamp;
      delete memory.errors[key];
    } catch (e) {
      memory.errors[key] = String(e?.message ?? e);
    }
    view.busy[key] = false;
    cx.notify();
  });
}

// What's old (or asked for again: force), or was fetched for other repos.
function refresh(view, cx, force) {
  const now = Date.now();
  const repos = boardRepos();
  const stamp = JSON.stringify(repos);
  const due = (key, s) => force || !memory.data[key] || memory.stamps[key] !== s || now - (memory.at[key] ?? 0) > FRESH;
  if (due("prs", stamp)) load(view, cx, "prs", stamp, () => fetchPrs(repos));
  if (due("issues", stamp)) load(view, cx, "issues", stamp, () => fetchIssues(repos));
}

// Every item the board knows: the sidebar's, then its own.
function known() {
  const items = { ...(shared("github")?.items ?? {}) };
  for (const p of memory.data.prs?.prs ?? []) items[p.url] = p;
  for (const i of memory.data.issues?.issues ?? []) items[i.url] = i;
  return items;
}

// Each Claude session's links (as the tasks list has them): those mh-tasks kept, and the
// running ones' now.
function sessionLinks() {
  const out = new Map();
  const put = (key, url) => (out.get(key) ?? out.set(key, new Set()).get(key)).add(url);
  for (const [id, e] of Object.entries(shared("tasks.sessions") ?? {})) for (const u of e.links ?? []) put(id, u);
  const direct = shared("github")?.shown?.direct ?? {};
  for (const t of terminals()) {
    const sid = t.state === "live" && t.labels?.["claude.session"];
    if (!sid) continue;
    const machine = t.address.includes("/") ? t.address.split("/")[0] : null;
    for (const u of direct[t.address] ?? []) put(machine ? `${machine}/${sid}` : sid, u);
  }
  return out;
}

// links: url -> Map(url -> why it's linked); sessions: url -> how many sessions had it.
function graphOf(items) {
  const links = new Map();
  const add = (a, b, why) => {
    if (!a || !b || a === b) return;
    const m = links.get(a) ?? links.set(a, new Map()).get(a);
    if (!m.has(b)) m.set(b, why);
  };
  for (const it of Object.values(items)) {
    for (const l of it.links ?? []) {
      add(it.url, l, it.kind === "pr" ? "closes" : "closed by");
      add(l, it.url, it.kind === "pr" ? "closed by" : "closes");
    }
  }
  const sessions = new Map();
  for (const urls of sessionLinks().values()) {
    for (const a of urls) {
      sessions.set(a, (sessions.get(a) ?? 0) + 1);
      for (const b of urls) add(a, b, "same session");
    }
  }
  return { links, sessions };
}

function sectionsOf(tab) {
  const by = new Map();
  for (const i of (tab.id === "prs" ? memory.data.prs?.prs : memory.data.issues?.issues) ?? []) by.set(i.repo, [...(by.get(i.repo) ?? []), i]);
  return [...by]
    .map(([name, items]) => ({ name, items: tab.id === "prs" ? stacked(items) : items.sort((a, b) => b.updated - a.updated) }))
    .sort((a, b) => Math.max(...b.items.map((i) => i.updated)) - Math.max(...a.items.map((i) => i.updated)));
}

function listAt(tab, rows) {
  const s = memory.sel[tab.id] ?? {};
  const i = rows.findIndex((it) => it.url === s.url);
  return i >= 0 ? i : Math.max(0, Math.min(s.i ?? 0, rows.length - 1));
}

function showTab(view, id) {
  memory.tab = id;
  view.reveal = true;
}

function move(view, dir, by = 1) {
  const md = view.model;
  const n = md.rows.length;
  if (!n) return;
  let i = md.at;
  if (dir === "down") i = Math.min(n - 1, i + by);
  else if (dir === "up") i = Math.max(0, i - by);
  else {
    const cur = md.starts.filter((s) => s <= i).length - 1;
    i = dir === "right" ? (md.starts[cur + 1] ?? i) : i > md.starts[cur] ? md.starts[cur] : md.starts[Math.max(0, cur - 1)];
  }
  memory.sel[md.tab.id] = { url: md.rows[i].url, i };
  view.reveal = true;
}

function edge(view, last) {
  const md = view.model;
  const i = last ? md.rows.length - 1 : 0;
  if (md.rows[i]) memory.sel[md.tab.id] = { url: md.rows[i].url, i };
  view.reveal = true;
}

function openUrl(it, cx) {
  markRead([it]);
  cx.spawn(async () => { await exec("open", [it.url]).catch(() => null); });
}

// What a new session for `it` would start in: its repo, a PR's branch, and a worktree's name.
function startOf(it) {
  const branch = it.kind === "pr" && !it.fork ? it.branch : null;
  const name = it.kind === "pr" ? it.branch?.replaceAll("/", "-") || `pr-${it.number}` : `issue-${it.number}`;
  return { repos: it.repo ? [it.repo] : [], branch, name };
}

// ↵: the item's sessions, in mh-sessions' tasks list for it, with new ones to start in its
// repo; picking one closes the board too.
function sessions(view, it) {
  if (!it) return;
  openOverlay({ mod: "mh-sessions", kind: "dialog", width: 680, height: 440, props: { tasks: true, url: it.url, parent: props().overlay, start: startOf(it), item: { kind: it.kind, repo: it.repo, number: it.number, title: it.title, state: it.state } } });
}

function linkedRows(view, url) {
  const { graph, items } = view.model;
  return [...(graph.links.get(url) ?? new Map())]
    .map(([u, why]) => ({ url: u, why, it: items[u] ?? unknown(u, 0) }))
    .sort((a, b) => KIND_ORDER[a.it.kind] - KIND_ORDER[b.it.kind] || FINAL.has(a.it.state) - FINAL.has(b.it.state));
}

// ⌥↵: what the item is linked to.
function linked(view, it) {
  if (!it) return;
  if (!linkedRows(view, it.url).length) return (view.note = "Nothing is linked to this.");
  view.picker = { it, at: 0 };
}

// The tab and selection that show `url`, or null when the board doesn't have it.
function find(url) {
  if ((memory.data.prs?.prs ?? []).some((p) => p.url === url)) return { tab: "prs", sel: { url } };
  if ((memory.data.issues?.issues ?? []).some((i) => i.url === url)) return { tab: "issues", sel: { url } };
  return null;
}

const preview = (it) => it?.url && openOverlay({ mod: "mh-spaces", kind: "dialog", width: 0.8, height: 0.86, props: { preview: it.url, behind: Boolean(it.behind), back: "board.focus" } });

function pickerKey(view, e, cx) {
  const rows = linkedRows(view, view.picker.it.url);
  const m = e.modifiers;
  if (e.key === "escape") view.picker = null;
  else if (e.key === "space") preview(rows[view.picker.at]?.it);
  else if (e.key === "j" || e.key === "down") view.picker.at = Math.min(rows.length - 1, view.picker.at + 1);
  else if (e.key === "k" || e.key === "up") view.picker.at = Math.max(0, view.picker.at - 1);
  else if (e.key === "enter") {
    const row = rows[view.picker.at];
    if (!row) return true;
    const at = !m.control && find(row.url);
    if (!at) return openUrl(row.it, cx), true;
    memory.sel[at.tab] = at.sel;
    showTab(view, at.tab);
    view.picker = null;
  } else return false;
  view.pickScroll.scroll_to_item(view.picker?.at ?? 0);
  return true;
}

function key(view, e, cx) {
  if (view.picker) return pickerKey(view, e, cx);
  const m = e.modifiers;
  const plain = !m.control && !m.alt && !m.platform;
  const tabs = tabsOf();
  const it = view.model.item;
  view.note = "";
  if (e.key === "escape") return closeOverlay(props().overlay), true;
  if (e.key === "space" && plain) return preview(it), true;
  if (e.key === "enter") {
    if (m.control) it && openUrl(it, cx);
    else if (m.alt) linked(view, it);
    else sessions(view, it);
    return true;
  }
  if (e.key === "tab") {
    const i = tabs.findIndex((t) => t.id === view.model.tab.id);
    return showTab(view, tabs[(i + (m.shift ? tabs.length - 1 : 1)) % tabs.length].id), true;
  }
  if (m.control && !m.alt && !m.platform) {
    const half = Math.max(1, Math.floor((view.listHeight ?? 340) / 2 / 34));
    const by = { d: half, u: half, j: 5, k: 5 }[e.key];
    if (by) return move(view, e.key === "d" || e.key === "j" ? "down" : "up", by), true;
  }
  if (!plain) return false;
  if (/^[1-9]$/.test(e.key) && tabs[Number(e.key) - 1]) return showTab(view, tabs[Number(e.key) - 1].id), true;
  if (e.key === "r") return refresh(view, cx, true), true;
  if (e.key === "g" || e.key === "G") return edge(view, m.shift || e.key === "G"), true;
  const dir = { h: "left", left: "left", j: "down", down: "down", k: "up", up: "up", l: "right", right: "right" }[e.key];
  if (!dir) return false;
  move(view, dir);
  return true;
}

function counts(url, view, t) {
  const { graph, items } = view.model;
  const k = { pr: 0, issue: 0 };
  for (const u of graph.links.get(url)?.keys() ?? []) k[kindOf(u, items)]++;
  const chip = (icon, n) => (n ? [h_flex().flex_none().gap(3).items_center().child(svg(icon).size(11)).child(String(n))] : []);
  return h_flex()
    .flex_none()
    .gap(8)
    .items_center()
    .text_size(11)
    .text_color(t.dim)
    .children([...chip(ICON("terminal"), graph.sessions.get(url) ?? 0), ...chip(GH.open.icon, k.pr), ...chip(GH["issue-open"].icon, k.issue)]);
}

const pick = (c, dark) => c[dark ? 1 : 0];
const stateIcon = (it, dark, t, size = 13) => {
  const s = GH[it.state];
  const fallback = it.kind === "issue" ? GH["issue-open"].icon : GH.open.icon;
  return svg(s?.icon ?? fallback).size(size).text_color(s ? pick(s.color, dark) : t.dim);
};

function select(view, tabId, sel, e, cx, it) {
  memory.sel[tabId] = sel;
  view.note = "";
  if (e.modifiers.control) openUrl(it, cx);
  else if (e.click_count >= 2) sessions(view, it);
  cx.notify();
}

function rowBase(id, on, t) {
  return h_flex()
    .id(id)
    .h(34)
    .flex_none()
    .px(10)
    .gap(10)
    .items_center()
    .rounded(7)
    .cursor_pointer()
    .when(on, (el) => el.bg(t.selected))
    .when(!on, (el) => el.hover((s) => s.bg(t.hover)));
}

// Approvals, change requests and comments, as GitHub counts them.
function reviews(p, t, dark) {
  const word = (n, text, color) => (n ? [div().flex_none().text_color(color).child(`${n} ${text}`)] : []);
  return h_flex()
    .flex_none()
    .gap(8)
    .items_center()
    .text_size(11)
    .children([
      ...word(p.approvals, "approved", pick(GREEN, dark)),
      ...word(p.changes, "changes", pick(RED, dark)),
      ...(p.comments ? [h_flex().flex_none().gap(3).items_center().text_color(t.dim).child(svg("mods/mh-spaces/comment.svg").size(11)).child(String(p.comments))] : []),
    ]);
}

// Lines, not text: the font draws the └ and ├ characters with different weight.
const branchMark = (last, t) =>
  div().relative().w(10).h(14).flex_none()
    .child(div().absolute().left(2).top(0).w(1).h(last ? 7 : 14).bg(t.dim))
    .child(div().absolute().left(2).top(7).w(6).h(1).bg(t.dim));

function prRow(view, p, i, on, t, dark) {
  const unread = shared("github")?.unread?.[prKey(p)];
  const check = CHECKS[p.checks];
  return rowBase(`pr-${p.url}`, on, t)
    .on_click((e, cx) => select(view, "prs", { url: p.url, i }, e, cx, p))
    .when(p.depth > 0, (el) => el.child(h_flex().w(p.depth * 14).flex_none().justify_end().child(branchMark(p.last, t))))
    .child(div().relative().w(14).flex_none().flex().justify_center().child(stateIcon(p, dark, t))
      .when(Boolean(unread), (el) => el.child(div().absolute().top(-2).right(-3).size(6).rounded(3).bg(pick(["#0969da", "#4493f8"], dark)))))
    .child(div().w(150).flex_none().truncate().text_size(11.5).text_color(t.dim).child(`${p.repo.split("/").pop()}#${p.number}`))
    .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).when(p.state === "draft", (el) => el.text_color(t.muted)).child(p.title))
    .when(asks(p), (el) => el.child(div().flex_none().px(5).rounded(4).text_size(10.5).text_color(t.ansi3).border_1().border_color(t.ansi3).child("review")))
    .when(Boolean(p.behind), (el) => el.child(div().flex_none().px(5).rounded(4).text_size(10.5).text_color(t.ansi3).border_1().border_color(t.ansi3).child("behind")))
    .child(reviews(p, t, dark))
    .child(div().flex_none().max_w(130).truncate().text_size(11.5).text_color(t.dim).child(p.mine ? "you" : p.author))
    .child(h_flex().w(34).flex_none().gap(4).items_center().text_size(11).text_color(t.dim).when(Boolean(check), (el) => el.child("CI").child(
      check[0] ? svg(ICON(check[0])).size(12).text_color(pick(check[1], dark)) : div().size(7).rounded(4).bg(pick(check[1], dark)))))
    .child(counts(p.url, view, t))
    .child(div().w(30).flex_none().text_right().text_size(11).text_color(t.dim).child(ago(p.updated)));
}

function issueRow(view, it, i, on, t, dark, login) {
  const who = it.assignees.length ? it.assignees : [it.author];
  const me = who.includes(login);
  return rowBase(`is-${it.url}`, on, t)
    .on_click((e, cx) => select(view, "issues", { url: it.url, i }, e, cx, it))
    .child(h_flex().w(14).flex_none().justify_center().child(stateIcon(it, dark, t)))
    .child(div().w(52).flex_none().text_size(11.5).text_color(t.dim).child(`#${it.number}`))
    .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(it.title))
    .children(it.labels.slice(0, 2).map((l) => h_flex().flex_none().max_w(140).gap(4).items_center().text_size(11).text_color(t.muted)
      .child(div().size(8).flex_none().rounded(4).bg(`#${l.color}`))
      .child(div().truncate().child(l.name))))
    .child(div().flex_none().max_w(130).truncate().text_size(11.5).text_color(me ? t.foreground : t.dim).when(me, (el) => el.font_semibold()).child(me ? "you" : who.join(", ")))
    .child(counts(it.url, view, t))
    .child(div().w(30).flex_none().text_right().text_size(11).text_color(t.dim).child(ago(it.updated)));
}

function listBody(view, t, dark) {
  const { tab, sections } = view.model;
  const children = [];
  const childOf = [];
  const login = memory.data[tab.id]?.login ?? "";
  let n = 0;
  for (const sec of sections) {
    children.push(h_flex().h(28).px(10).pt(8).flex_none().items_center().text_size(11).text_color(t.dim).child(`${sec.name} · ${sec.items.length}`));
    for (const it of sec.items) {
      childOf[n] = children.length;
      const on = n === view.model.at;
      children.push(tab.id === "prs" ? prRow(view, it, n, on, t, dark) : issueRow(view, it, n, on, t, dark, login));
      n++;
    }
  }
  view.model.childOf = childOf;
  const none = !boardRepos().length
    ? "No repos yet: put repos in a sidebar folder, or add them in the spacing dialog's Board tab."
    : tab.id === "prs" ? "No open PRs." : "No open issues.";
  return v_flex()
    .id(`list-${tab.id}`)
    .on_size_change((size) => (view.listHeight = size.height))
    .flex_1()
    .min_h(0)
    .overflow_y_scrollbar()
    .track_scroll(view.listScroll)
    .children(children)
    .when(!n, (el) => el.child(div().p(10).text_color(t.dim).child(memory.data[tab.id] ? none : view.busy[tab.id] ? "Asking GitHub…" : "")));
}

function pickerPanel(view, t, dark) {
  const { it, at } = view.picker;
  const rows = linkedRows(view, it.url);
  return div()
    .absolute()
    .top(0)
    .left(0)
    .right(0)
    .bottom(0)
    .flex()
    .items_center()
    .justify_center()
    .bg("#00000055")
    .child(v_flex()
      .id("linked")
      .w(620)
      .p(14)
      .gap(8)
      .rounded(10)
      .border_1()
      .border_color(t.border)
      .bg(t.popover)
      .shadow_lg()
      .child(div().flex_none().truncate().font_semibold().text_color(t.foreground).child(`Linked to ${refOf(it)} ${it.title ?? ""}`))
      .child(v_flex().id("linked-list").h(Math.min(360, rows.length * 34)).flex_none().overflow_y_scrollbar().track_scroll(view.pickScroll)
        .children(rows.map((r, i) => rowBase(`ln-${r.url}`, i === at, t)
          .on_click((e, cx) => {
            view.picker.at = i;
            if (e.modifiers.control) openUrl(r.it, cx);
            else if (e.click_count >= 2) pickerKey(view, { key: "enter", modifiers: e.modifiers }, cx);
            cx.notify();
          })
          .child(h_flex().w(14).flex_none().justify_center().child(stateIcon(r.it, dark, t)))
          .child(div().w(150).flex_none().truncate().text_size(11.5).text_color(t.dim).child(refOf(r.it)))
          .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(r.it.title || r.url))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(r.why)))))
      .child(h_flex().flex_none().justify_end().text_size(11).text_color(t.dim).child("space preview · ↵ go to · ⌃↵ open · esc back")));
}

export function boardRender(view) {
  const t = theme();
  const dark = Boolean(settings()?.dark);
  const tabs = tabsOf();
  const tab = tabs.find((x) => x.id === memory.tab) ?? tabs[0];
  memory.tab = tab.id;
  const items = known();
  const model = { tab, items, graph: graphOf(items) };
  model.sections = sectionsOf(tab);
  model.rows = model.sections.flatMap((s) => s.items);
  let n = 0;
  model.starts = model.sections.map((s) => ((n += s.items.length), n - s.items.length));
  model.at = listAt(tab, model.rows);
  model.item = model.rows[model.at] ?? null;
  view.model = model;
  const body = listBody(view, t, dark);
  if (view.reveal) {
    view.reveal = false;
    view.listScroll.scroll_to_item(model.childOf?.[model.at] ?? 0);
  }
  const countOf = (x) => (x.id === "prs" ? memory.data.prs?.prs.length : memory.data.issues?.issues.length);
  const tabEl = (x, i) => h_flex().id(`tab-${x.id}`).flex_none().gap(6).px(10).py(4).rounded(6).cursor_pointer()
    .text_color(x.id === tab.id ? t.foreground : t.muted)
    .when(x.id === tab.id, (el) => el.bg(t.selected))
    .when(x.id !== tab.id, (el) => el.hover((s) => s.bg(t.hover)))
    .on_click((_e, cx) => { showTab(view, x.id); view.note = ""; cx.notify(); })
    .child(x.name)
    .when(countOf(x) != null, (el) => el.child(div().text_size(11).text_color(t.dim).child(String(countOf(x)))))
    .tooltip(i < 9 ? `${i + 1} · tab` : "tab");
  const error = memory.errors[tab.id];
  const status = view.busy[tab.id]
    ? h_flex().gap(6).items_center().child(div().frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 90)).child("refreshing")
    : error ? div().max_w(360).truncate().text_color(t.blocked).child(error)
    : memory.at[tab.id] ? div().child(Date.now() - memory.at[tab.id] < 60000 ? "updated now" : `updated ${ago(memory.at[tab.id])} ago`) : div();
  const gh = memory.data[tab.id];
  const notes = [
    view.note,
    gh?.missing?.length ? `Not on GitHub, or gh can't see: ${gh.missing.join(", ")}` : "",
    gh?.partial ? "Some repos couldn't be asked." : "",
  ].filter(Boolean);
  const hint = view.picker ? "" : ["hjkl move", "^D ^U half page", "^J ^K 5 rows", "space preview", "↵ sessions", "⌃↵ open on GitHub", "⌥↵ linked", "tab next", "r refresh", "esc close"].join(" · ");
  return v_flex()
    .id("board")
    .relative()
    .track_focus(view.handle)
    .on_key_down((e, cx) => {
      if (!key(view, e, cx)) return;
      cx.stop_propagation();
      cx.notify();
    })
    .size_full()
    .min_h(0)
    .p(16)
    .gap(10)
    .bg(t.popover)
    .text_size(13)
    .child(h_flex().flex_none().gap(4).items_center()
      .child(h_flex().flex_1().min_w(0).gap(4).items_center().overflow_hidden().children(tabs.map(tabEl)))
      .child(div().flex_none().text_size(11).text_color(t.dim).child(status)))
    .child(body)
    .child(h_flex().flex_none().gap(12).items_center().text_size(11).text_color(t.dim)
      .child(div().flex_1().min_w(0).truncate().text_color(view.note ? t.muted : t.dim).child(notes.join(" · ")))
      .child(div().flex_none().child(hint)))
    .when(Boolean(view.picker), (el) => el.child(pickerPanel(view, t, dark)));
}

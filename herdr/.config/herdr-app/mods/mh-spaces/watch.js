// Other copies only ask (shared("watch.ask")); the sidebar copy owns the `mh-watch` doc and the poll.

import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { shared, setShared, window, run, openOverlay, notify } from "herdr";
import { GH, PR, colorOf, graphql, markRead, open, stateOf } from "./github.js";
import { docOf, updateDoc } from "./docs.js";
import { WATCH_FIELDS, goneOf, moveOf, shownOf, tomorrow } from "./watch-data.js";
import { button, chip, darkOf } from "./pixel.js";
import { BLUE, GREEN, ORANGE, PURPLE, RED } from "./jira.js";
import { track } from "./stats.js";

const NAME = "mh-watch";
const POLL = 2 * 60000;
const RETRY = 10 * 60000;
const ROW = 26;
const shape = (stored) => ({ prs: stored?.prs ?? {} });
// One color and icon per reason, so they tell apart at a glance.
const BADGE = {
  "CI failed": ["CI", RED, "mods/pr/circle-x.svg"],
  "changes asked": ["CHANGES", ORANGE, "mods/mh-spaces/file-diff.svg"],
  "new reply": ["REPLY", BLUE, "mods/mh-spaces/comment.svg"],
  "merge it": ["MERGE", GREEN, "mods/pr/git-merge.svg"],
  "review asked": ["REVIEW", PURPLE, "mods/workspace-chrome/git-compare.svg"],
};
const badge = (why, dark) => {
  const [text, pair, icon] = BADGE[why];
  const c = pair[dark ? 1 : 0];
  return chip(text, c, svg(icon).size(10).text_color(c));
};

// op: "add", "remove", "seen" or "snooze". Explicit, so a stop never turns into a start.
export const askWatch = (url, op) => setShared("watch.ask", [...(shared("watch.ask") ?? []), { url, op, at: Date.now() }]);

// Asks the sidebar has not taken yet count too.
function watchedNow(url) {
  const last = (shared("watch.ask") ?? []).filter((a) => a.url === url && (a.op === "add" || a.op === "remove")).pop();
  return last ? last.op === "add" : (shared("watch.urls") ?? []).includes(url);
}

export function toggleWatch(url) {
  const pr = url?.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
  if (!pr) return notify({ title: "No PR to watch", body: "This space has no PR. Use w on the board.", level: "info" });
  const on = watchedNow(url);
  const state = shared("github")?.items?.[url]?.state;
  if (!on && (state === "merged" || state === "closed")) return notify({ title: `#${pr[1]} is ${state}`, body: "Nothing to follow up.", level: "info" });
  track("mh-spaces.watch", on ? "stop" : "start");
  notify({ title: `${on ? "Stopped watching" : "Watching"} #${pr[1]}`, level: "info" });
  askWatch(url, on ? "remove" : "add");
}

// The mouse way to w: a pin, lit while watched.
export function watchButton(url, t, id) {
  const on = watchedNow(url);
  return div().id(id).flex_none().size(18).flex().items_center().justify_center().rounded(4).cursor_pointer()
    .text_color(on ? t.accent : t.dim).hover((st) => st.bg(t.hover).text_color(on ? t.accent : t.foreground))
    .tooltip(on ? "Watching in the sidebar · click: stop" : "Watch in the sidebar · w")
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => { cx.stop_propagation(); toggleWatch(url); cx.notify(); })
    .child(svg("mods/workspace-chrome/pin.svg").size(12));
}

function apply(prs, asks) {
  for (const { url, op, at } of asks) {
    if (op === "add") prs[url] ??= { seen: at };
    else if (op === "remove") delete prs[url];
    else if (prs[url] && op === "seen") prs[url] = { ...prs[url], seen: at };
    else if (prs[url] && op === "snooze") prs[url] = { ...prs[url], snooze: tomorrow(at) };
  }
  return prs;
}

function publish(view) {
  const urls = Object.keys(view.watch.prs);
  if (JSON.stringify(urls) !== JSON.stringify(shared("watch.urls") ?? [])) setShared("watch.urls", urls);
}

export function watchInit(view) {
  view.watch = { prs: {} };
  view.watchNodes = {};
  view.watchMissing = new Set(); // urls GitHub gave nothing for
  view.watchLoaded = false;
  view.watchLogin = null;
  view.watchAt = 0;
  view.watchMenu = null;
  try { view.watchFolded = localStorage.getItem("watch.folded") === "1"; } catch { view.watchFolded = false; }
}

function fold(view) {
  view.watchFolded = !view.watchFolded;
  track("mh-spaces.sidebar.watch-fold", "click");
  try { localStorage.setItem("watch.folded", view.watchFolded ? "1" : "0"); } catch {}
}

const save = (asks) => updateDoc(NAME, null, shape, (doc) => ({ prs: apply(doc.prs, asks) }));

export function watchDue(view, now, cx) {
  const asks = shared("watch.ask") ?? [];
  if (asks.length && !view.watchBusy) {
    setShared("watch.ask", []);
    // Before the first read the list is empty here: publishing it would drop every other watched PR.
    if (view.watchLoaded) {
      apply(view.watch.prs, asks);
      publish(view);
    }
    view.watchBusy = true;
    cx.spawn(async (cx) => {
      try {
        view.watch = await save(asks);
        view.watchLoaded = true;
        publish(view);
        if (asks.some((a) => a.op === "add")) view.watchAt = 0;
      } catch (e) {
        notify({ title: "Couldn't save the watch list", body: String(e?.message ?? e), level: "error" });
      }
      view.watchBusy = false;
      cx.notify();
    });
    return;
  }
  if (view.watchBusy || now < view.watchAt || window()?.active === false) return;
  view.watchBusy = true;
  view.watchAt = now + POLL;
  cx.spawn(async (cx) => {
    try {
      view.watch = shape((await docOf(NAME, null)).value);
      view.watchLoaded = true;
      const gone = Object.keys(view.watch.prs).filter((u) => goneOf(view.watchNodes[u], Date.now()));
      if (gone.length) view.watch = await save(gone.map((url) => ({ url, op: "remove" })));
      for (const u of gone) delete view.watchNodes[u];
      publish(view);
      const urls = Object.keys(view.watch.prs);
      if (urls.length) {
        const data = await graphql([`viewer { login }`, ...urls.map((u, i) => `a${i}: resource(url: ${JSON.stringify(u)}) { ... on PullRequest { ${PR} ${WATCH_FIELDS} } }`)].join("\n"));
        view.watchLogin = data?.viewer?.login ?? view.watchLogin;
        urls.forEach((u, i) => {
          const n = data?.[`a${i}`];
          if (n?.number) (view.watchNodes[u] = n), view.watchMissing.delete(u);
          else if (data) view.watchMissing.add(u);
        });
      }
      view.watchWarned = false;
    } catch (e) {
      view.watchAt = Date.now() + RETRY;
      if (!view.watchWarned) notify({ title: "Watched PRs are not updating", body: String(e?.message ?? e).slice(0, 300), level: "warning" });
      view.watchWarned = true;
    }
    view.watchBusy = false;
    cx.notify();
  });
}

function rowOf(view, url) {
  const n = view.watchNodes[url];
  const m = url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  const { seen = 0, snooze = 0 } = view.watch.prs[url];
  const base = { url, snooze, repo: n?.repository?.nameWithOwner ?? m?.[1] ?? "", number: n?.number ?? Number(m?.[2]), title: n?.title ?? "", node: n };
  if (view.watchMissing.has(url)) return { ...base, move: "wait", why: "not found" };
  if (!n || !view.watchLogin) return { ...base, move: "wait", why: "…" };
  return { ...base, ...moveOf(n, view.watchLogin, seen), closedAt: Date.parse(n.closedAt ?? "") || 0 };
}

function go(r, e, cx) {
  track("mh-spaces.sidebar.watch", "click");
  askWatch(r.url, "seen");
  markRead([{ kind: "pr", repo: r.repo, number: r.number }]);
  if (e.modifiers.platform) return open(r.url, cx);
  const space = Object.entries(shared("github")?.shown?.spaces ?? {}).find(([, urls]) => urls.includes(r.url))?.[0];
  if (space) run("space.select", { id: space });
  else openOverlay({ mod: "mh-spaces", kind: "dialog", width: 0.8, height: 0.76, props: { preview: r.url } });
}

function row(view, r, t, dark) {
  const s = GH[r.node ? stateOf(r.node) : "open"];
  const yours = r.move === "you";
  const menu = view.watchMenu === r.url;
  const small = (id, text, click) => button(div(), t, false).id(id).px(8).h(20).flex().items_center().text_size(11).text_color(t.muted).cursor_pointer()
    .hover((st) => st.text_color(t.foreground)).on_click((_e, cx) => { cx.stop_propagation(); view.watchMenu = null; click(); cx.notify(); }).child(text);
  return v_flex().flex_none()
    .child(h_flex().id(`watch-${r.url}`).h(ROW).px(8).gap(7).items_center().rounded(6).cursor_pointer().hover((st) => st.bg(t.hover))
      .tooltip(`${r.repo}#${r.number} · ${r.title}\n${yours ? "Your move" : r.move === "done" ? "Done" : "Waiting"}: ${r.why}\nclick: its space or preview · ⌘-click: GitHub · right-click: snooze or stop`)
      .on_click((e, cx) => go(r, e, cx))
      .on_mouse_down("right", (_e, cx) => { view.watchMenu = menu ? null : r.url; cx.notify(); })
      .child(svg(s.icon).size(11).flex_none().text_color(colorOf(s, t)))
      .child(div().flex_none().text_size(11).text_color(t.muted).child(String(r.number)))
      .child(div().flex_1().min_w(0).truncate().text_color(yours ? t.foreground : t.dim).child(r.title.replace(/^\w+(\([^)]*\))?!?:\s*/, "") || r.repo))
      .child(yours ? badge(r.why, dark) : div().flex_none().text_size(11).text_color(t.dim).child(r.why)))
    .when(menu, (el) => el.child(h_flex().pl(26).pb(4).gap(6)
      .child(small(`watch-snooze-${r.url}`, "Snooze till 8:00", () => { track("mh-spaces.sidebar.watch-snooze", "click"); askWatch(r.url, "snooze"); }))
      .child(small(`watch-stop-${r.url}`, "Stop watching", () => { track("mh-spaces.sidebar.watch-stop", "click"); askWatch(r.url, "remove"); }))));
}

export function watchSection(view, t, collapsed) {
  if (collapsed) return null;
  const dark = darkOf(t);
  const now = Date.now();
  const all = Object.keys(view.watch.prs).map((u) => rowOf(view, u));
  const rows = shownOf(all, now);
  const snoozed = all.filter((r) => r.snooze > now).length;
  const folded = view.watchFolded;
  // Folded, the chevron turns yellow while a PR waits on you, as the folders' chevrons do.
  const waiting = rows.some((r) => r.move === "you");
  return v_flex().flex_none().mx(8).pt(6).pb(folded ? 4 : 8).border_t_1().border_color(t.border)
    .child(h_flex().id("watch-head").h(26).px(8).gap(7).items_center().rounded(6).text_size(11).font_semibold().text_color(t.dim)
      .cursor_pointer().hover((st) => st.bg(t.hover).text_color(t.foreground))
      .tooltip(folded ? "Show the watched PRs" : "Hide the watched PRs")
      .on_click((_e, cx) => { fold(view); cx.notify(); })
      .child(div().flex_1().child("WATCHING"))
      .when(snoozed > 0 && !folded, (el) => el.child(div().font_normal().child(`${snoozed} snoozed`)))
      .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none().when(folded && waiting, (el) => el.text_color(t.ansi3))))
    .when(!folded && !all.length, (el) => el.child(div().px(8).h(ROW).flex().items_center().text_size(12).text_color(t.dim).child("w on a PR, or ^A W, to watch it")))
    .when(!folded, (el) => el.child(v_flex().id("watch-list").max_h(ROW * 8 + 30).overflow_y_scroll().children(rows.map((r) => row(view, r, t, dark)))));
}

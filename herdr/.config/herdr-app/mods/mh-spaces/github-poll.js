// The sidebar's GitHub polling: linked items' and branches' PRs, and unread news. Functions of
// the Spaces view (main.js), which keeps the state they read and write.

import { shared, setShared, window, notify } from "herdr";
import { FINAL, fetchGitHub, fetchUnread } from "./github.js";

// GitHub is asked again this often while the window is in front: open PRs and
// issues and branches' PRs, then merged and closed ones; after a failure, not before.
const GH_OPEN = 2 * 60000;
const GH_FINAL = 30 * 60000;
const GH_RETRY = 10 * 60000;
const GH_UNREAD = 60000;

export function githubDue(view, now, sp, ps, cx) {
  if (view.fetching || now < view.ghRetry) return;
  const active = window().active;
  const old = (at, final) => active && now - (at ?? 0) > (final ? GH_FINAL : GH_OPEN);
  const urls = [...new Set([...Object.values(shared("github.links") ?? {}).flat(), ...Object.values(shared("github.agent-links") ?? {}).flat(), ...Object.values(view.agentLinks).flat(), ...view.historyLinks()])]
    .filter((u) => (!view.items[u]?.links || view.stale.has(u) || old(view.items[u].at, FINAL.has(view.items[u].state))));
  const keys = [...new Set(sp.map((s) => view.branchKey(s, ps)).filter(Boolean))].filter((k) => !view.branchPrs[k] || old(view.branchPrs[k].at, false));
  if (!urls.length && !keys.length) return;
  view.fetching = true;
  for (const u of urls) view.stale.delete(u);
  cx.spawn(async (cx) => {
    try {
      const r = await fetchGitHub(urls, keys.map((key) => { const [repo, branch] = key.split("\0"); return { key, repo, branch }; }));
      for (const [url, it] of Object.entries(r.items)) view.items[url] = { links: view.items[url]?.links, ...it };
      for (const [k, url] of Object.entries(r.branches)) view.branchPrs[k] = { url, at: Date.now(), base: r.items[url]?.base ?? null };
      if (!r.ok) view.ghRetry = Date.now() + GH_RETRY;
      ghFailed(view, "badges", r.ok ? null : r.error ?? "GitHub gave no data.");
    } catch (e) {
      view.ghRetry = Date.now() + GH_RETRY;
      ghFailed(view, "badges", e);
    }
    view.fetching = false;
    cx.notify();
  });
}

// Badges and news keep their last state while GitHub can't be asked: say so once per poll,
// until that poll works again. One flag each: the other poll working says nothing about this one.
const FAILED = { badges: "GitHub badges are not updating", news: "GitHub PR news is not updating" };
function ghFailed(view, poll, error) {
  view.ghWarned ??= {};
  if (!error) return void (view.ghWarned[poll] = false);
  if (view.ghWarned[poll]) return;
  view.ghWarned[poll] = true;
  notify({ title: FAILED[poll], body: `${String(error?.message ?? error).slice(0, 300)}\nChecked again in ${GH_RETRY / 60000} minutes.`, level: "warning" });
}

// GitHub's unread notifications about PRs, each minute while the window is active and
// a PR is shown. News opened from a badge (shared("github.read.ask")) stays read until
// there's newer, or GitHub agrees.
export function unreadDue(view, now, cx) {
  const asks = shared("github.read.ask") ?? [];
  if (asks.length) {
    setShared("github.read.ask", []);
    for (const a of asks) view.dismissed[a.key] = Math.max(view.dismissed[a.key] ?? 0, a.at);
    cx.notify();
  }
  if (view.unreading || now < view.unreadAt || !window().active) return;
  if (!Object.values(view.items).some((it) => it.kind === "pr")) return;
  view.unreading = true;
  cx.spawn(async (cx) => {
    try {
      view.unread = await fetchUnread();
      for (const [key, at] of Object.entries(view.dismissed)) if (!view.unread[key] || view.unread[key].at > at) delete view.dismissed[key];
      view.unreadAt = Date.now() + GH_UNREAD;
      ghFailed(view, "news", null);
    } catch (e) {
      view.unreadAt = Date.now() + GH_RETRY;
      ghFailed(view, "news", e);
    }
    view.unreading = false;
    cx.notify();
  });
}

// In mh-spaces, not a mod of its own, to reuse badge(): a mod can't import from another mod's folder.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, focused, shared, theme, window as appWindow } from "herdr";
import { badge, unknown } from "./github.js";

// shortcut: polls the shown repo every 5 s instead of watching its files; switch to watchFolder if it lags.
const EVERY = 5000;

// As the Changes panel's reads: no index lock, refresh or fsmonitor cookie, which the sidebar's .git watch would see.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const git = (args, g) => exec("git", [...READ, ...args], { cwd: g.top, on: g.machine, timeout: 5000 });
const lines = (r) => (r.code === 0 ? r.stdout.split("\n").filter(Boolean) : null);
const stat = (rows, untracked = 0) => {
  const sum = (i) => rows.reduce((n, line) => n + (Number(line.split("\t")[i]) || 0), 0);
  return { files: rows.length + untracked, added: sum(0), deleted: sum(1), untracked };
};
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const prsOf = (id, gh) => (gh.shown?.spaces?.[id] ?? []).filter((u) => (gh.items?.[u] ?? unknown(u, 0)).kind === "pr");

// The branch's PR says what it was made from, so a stacked branch compares with its parent.
function prBase(id, g) {
  const gh = shared("github") ?? {};
  if (g.base) return `origin/${g.base}`;
  const mine = prsOf(id, gh).map((u) => gh.items?.[u]).filter((it) => it?.branch === g.branch && it.base && it.repo?.toLowerCase() === g.gh?.toLowerCase());
  const it = mine.find((it) => it.state === "open") ?? mine[0];
  return it ? `origin/${it.base}` : null;
}

export function barInit(view, cx) {
  view.diff = {};
  view.diffAt = {};
  view.diffBusy = new Set();
  cx.timer.every(1000, (cx) => tick(view, cx));
}

function tick(view, cx) {
  if (!appWindow()?.active) return;
  const id = focused()?.space;
  const g = shared("git.spaces")?.[id];
  if (!g) return;
  const pr = prBase(id, g);
  const key = JSON.stringify([g.machine, g.top]);
  if (view.diffBusy.has(key) || Date.now() - (view.diffAt[key] ?? 0) < EVERY) return;
  view.diffBusy.add(key);
  view.diffAt[key] = Date.now();
  cx.spawn(async (cx) => {
    try {
      const [numstat, others, head] = await Promise.all([
        git(["diff", "HEAD", "--numstat"], g),
        git(["ls-files", "--others", "--exclude-standard"], g),
        git(["rev-parse", "--abbrev-ref", "origin/HEAD"], g),
      ]);
      // A repo with no commit yet has no HEAD to diff against: only untracked files.
      const changed = lines(numstat) ?? [], untracked = lines(others);
      // Without a PR, or with its base not fetched here, compare with the default branch.
      let base = null, branch = null;
      for (const b of [pr, lines(head)?.[0]].filter(Boolean)) {
        branch = lines(await git(["diff", "--numstat", `${b}...HEAD`], g));
        if (branch) {
          base = b;
          break;
        }
      }
      if (untracked) view.diff[key] = { base, branch: branch && stat(branch), local: stat(changed, untracked.length) };
      else delete view.diff[key];
    } catch {
      delete view.diff[key];
    }
    view.diffBusy.delete(key);
    cx.notify();
  });
}

export function barRender(view) {
  const t = theme();
  const id = focused()?.space;
  const g = shared("git.spaces")?.[id];
  const bar = h_flex().size_full().px(12).gap(16).items_center().overflow_hidden().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted);
  if (!g) return bar;
  const d = view.diff[JSON.stringify([g.machine, g.top])];
  const gh = shared("github") ?? {};
  const prs = prsOf(id, gh);
  const icon = (path) => svg(path).size(13).flex_none().text_color(t.dim);
  return bar
    .child(h_flex().id("bar-branch").min_w(0).gap(6).items_center()
      .tooltip(g.linked ? `${g.branch} (worktree)` : g.branch)
      .child(icon("mods/workspace-chrome/git-branch.svg"))
      .child(div().min_w(0).truncate().text_color(t.foreground).child(g.branch))
      .when(g.linked, (el) => el.child(div().flex_none().text_color(t.dim).child("worktree")))
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`↑${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`↓${g.behind}`))))
    .when(Boolean(d), (el) => {
      const b = d.branch, l = d.local;
      const counts = (s) => [
        div().text_color(t.ansi2).child(`+${s.added}`),
        div().text_color(t.ansi1).child(`-${s.deleted}`),
      ];
      return el
        .when(Boolean(b?.files), (el) => el.child(h_flex().id("bar-branch-diff").flex_none().gap(6).items_center()
          .tooltip(`This branch compared with ${d.base}`)
          .child(icon("mods/mh-spaces/file-diff.svg"))
          .child(plural(b.files, "file"))
          .children(counts(b))
          .child(div().text_color(t.dim).child(`vs ${d.base.replace(/^origin\//, "")}`))))
        .when(l.files > 0, (el) => el.child(h_flex().id("bar-local").flex_none().gap(6).items_center()
          .tooltip(`Not committed: ${plural(l.files, "file")} +${l.added} -${l.deleted}${l.untracked ? `, ${l.untracked} untracked` : ""}`)
          .child(svg("mods/workspace-chrome/square-pen.svg").size(13).flex_none().text_color(t.ansi3))
          .child(div().text_color(t.ansi3).child(`${l.files} uncommitted`))))
        .when(Boolean(d.base) && !b.files && !l.files, (el) => el.child(h_flex().flex_none().gap(6).items_center()
          .child(icon("mods/mh-spaces/file-diff.svg"))
          .child("no changes")));
    })
    .child(div().flex_1())
    .children(prs.map((u, i) => h_flex().flex_none().gap(6).items_center()
      .child(badge(u, gh.items ?? {}, t, `bar-pr-${i}`))
      .child(div().max_w(320).truncate().child(gh.items?.[u]?.title ?? ""))));
}

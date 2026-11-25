// The git bar under the terminal (props { bar: true }), for the shown space: branch and ahead/behind
// (shared("git.spaces"), from the sidebar copy), uncommitted changes (asked here) and its PRs (shared("github")).

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, focused, agents, shared, theme, window as appWindow } from "herdr";
import { badge } from "./github.js";

// shortcut: polls the shown repo every 5 s instead of watching its files; switch to watchFolder if it lags.
const EVERY = 5000;

const lines = (r) => (r.code === 0 ? r.stdout.split("\n").filter(Boolean) : null);

export function barInit(view, cx) {
  view.diff = {}; // JSON [machine, top] -> { files, added, deleted, untracked }
  view.diffAt = {};
  cx.timer.every(1000, (cx) => tick(view, cx));
}

function tick(view, cx) {
  if (appWindow()?.visible === false || view.diffBusy) return;
  const g = shared("git.spaces")?.[focused()?.space];
  if (!g) return;
  const key = JSON.stringify([g.machine, g.top]);
  if (Date.now() - (view.diffAt[key] ?? 0) < EVERY) return;
  view.diffBusy = true;
  view.diffAt[key] = Date.now();
  cx.spawn(async (cx) => {
    try {
      const on = { cwd: g.top, on: g.machine };
      const [numstat, others] = await Promise.all([
        exec("git", ["diff", "HEAD", "--numstat"], on),
        exec("git", ["ls-files", "--others", "--exclude-standard"], on),
      ]);
      const changed = lines(numstat), untracked = lines(others);
      if (changed && untracked) {
        const sum = (i) => changed.reduce((n, line) => n + (Number(line.split("\t")[i]) || 0), 0);
        view.diff[key] = { files: changed.length + untracked.length, added: sum(0), deleted: sum(1), untracked: untracked.length };
      }
    } catch {}
    view.diffBusy = false;
    cx.notify();
  });
}

export function barRender(view) {
  const t = theme();
  const id = focused()?.space;
  const g = shared("git.spaces")?.[id];
  const bar = h_flex().size_full().px(12).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted);
  if (!g) return bar;
  const d = view.diff[JSON.stringify([g.machine, g.top])];
  const gh = shared("github") ?? {};
  const mates = agents().filter((a) => a.space === id).map((a) => a.address);
  const prs = [...new Set([gh.branches?.[id], ...mates.flatMap((a) => gh.shown?.direct?.[a] ?? [])])]
    .filter((u) => u && (gh.items?.[u]?.kind ?? "pr") === "pr");
  const icon = (path) => svg(path).size(13).flex_none().text_color(t.dim);
  return bar
    .child(h_flex().id("bar-branch").min_w(0).gap(6).items_center()
      .tooltip(g.linked ? `${g.branch} (worktree)` : g.branch)
      .child(icon("mods/workspace-chrome/git-branch.svg"))
      .child(div().min_w(0).truncate().text_color(t.foreground).child(g.branch))
      .when(g.linked, (el) => el.child(div().flex_none().text_color(t.dim).child("worktree")))
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`↑${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`↓${g.behind}`))))
    .when(Boolean(d), (el) => el.child(h_flex().id("bar-diff").flex_none().gap(6).items_center()
      .tooltip(d.untracked ? `Uncommitted changes, ${d.untracked} untracked` : "Uncommitted changes")
      .child(icon("mods/mh-spaces/file-diff.svg"))
      .when(d.files === 0, (el) => el.child("no changes"))
      .when(d.files > 0, (el) => el
        .child(`${d.files} ${d.files === 1 ? "file" : "files"}`)
        .child(div().text_color(t.ansi2).child(`+${d.added}`))
        .child(div().text_color(t.ansi1).child(`-${d.deleted}`)))))
    .child(div().flex_1())
    .children(prs.map((u, i) => h_flex().flex_none().gap(6).items_center()
      .child(badge(u, gh.items ?? {}, t, `bar-pr-${i}`))
      .child(div().max_w(320).truncate().child(gh.items?.[u]?.title ?? ""))));
}

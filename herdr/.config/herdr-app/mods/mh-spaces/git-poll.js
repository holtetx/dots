// The sidebar's git polling: each place's branch, ahead/behind and repo, and a watch on
// local repos. Functions of the Spaces view (main.js), which keeps the state they read and write.

import { exec, watchFolder } from "herdr";
import { githubRepo } from "./github.js";

const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// A repo's name from its git folder: the folder holding .git, a bare repo's own
// name, or the folder holding a hidden bare repo (<project>/.bare).
const repoName = (common) => {
  if (common.endsWith("/.git")) return base(common.slice(0, -5));
  const own = base(common);
  return own === ".bare" ? base(common.slice(0, -own.length - 1)) : own.replace(/\.git$/, "");
};

// A detached HEAD as the nearest branch or tag below it and the commits since:
// "main", "origin/main~2", else "@a1b2c3d".
async function detached(cwd, on) {
  const r = await exec("git", ["describe", "--all", "--always"], { cwd, on });
  if (r.code !== 0) return "(detached)";
  const d = r.stdout.trim().replace(/^(heads|remotes|tags)\//, "");
  const m = d.match(/^(.+)-(\d+)-g[0-9a-f]+$/);
  return m ? `${m[1]}~${m[2]}` : /^[0-9a-f]{7,}$/.test(d) ? `@${d}` : d;
}

// Places looked at together (several git runs each). All at once, a few hundred spaces
// run out of the app's open files (256 when started from the Dock on macOS) or
// past a machine core's 16 running execs, and those spaces wait for main.js's FALLBACK.
const AT_ONCE = 6;

// Every run, finished: a place isn't done while one of its runs still holds a slot.
async function settled(...runs) {
  const done = await Promise.allSettled(runs);
  const failed = done.find((d) => d.status === "rejected");
  if (failed) throw failed.reason;
  return done.map((d) => d.value);
}

// `key` and the other places in its repo (a commit there moves their ahead/behind).
export function sameRepo(view, key, keys) {
  const repo = view.git[key]?.repo;
  return [key, ...(repo ? [...keys].filter((k) => view.git[k]?.repo === repo) : [])];
}

// One look at a time, each place once however often it was asked for meanwhile.
export function refreshGit(view, keys, cx) {
  for (const k of keys) view.pending.add(k);
  if (view.refreshing) return;
  view.refreshing = true;
  cx.spawn(async (cx) => {
    while (view.pending.size) {
      const keys = [...view.pending];
      view.pending.clear();
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(AT_ONCE, keys.length) }, async () => {
        while (next < keys.length) await check(view, keys[next++], cx);
      }));
    }
    const used = new Set(Object.values(view.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
    for (const [repo, pending] of view.watching) if (!used.has(repo)) {
      view.watching.delete(repo);
      pending.cancel();
    }
    view.refreshing = false;
    cx.notify();
  });
}

// One place's git: branch, ahead/behind, its repo.
async function check(view, key, cx) {
  const [on, cwd] = JSON.parse(key);
  view.checked[key] = Date.now();
  view.unsure.delete(key);
  try {
    // Ref-only reads avoid scanning the worktree or waking its index watch.
    // Two reads: a folder name may itself contain a newline.
    const [r, common] = await settled(
      exec("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd, on }),
      exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on }),
    );
    if (r.code !== 0 || common.code !== 0) {
      // Only git's own "no" is remembered as no repo; anything else is asked again.
      if (!/not a git repository/i.test(r.code !== 0 ? r.stderr : common.stderr)) {
        view.unsure.add(key);
        view.git[key] ??= null;
      } else view.git[key] = null;
      return;
    }
    // The repo's own .git folder names it; a worktree's top differs from it.
    const top = r.stdout.replace(/\n$/, ""), repo = common.stdout.replace(/\n$/, "");
    const [branch, counts, origin] = await settled(
      exec("git", ["symbolic-ref", "-q", "HEAD"], { cwd, on }),
      exec("git", ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], { cwd, on }),
      exec("git", ["remote", "get-url", "origin"], { cwd, on }),
    );
    const name = repoName(repo);
    const [ahead, behind] = counts.code === 0 ? counts.stdout.trim().split(/\s+/).map(Number) : [0, 0];
    const info = { name, top, branch: branch.code === 0 ? branch.stdout.trim().replace(/^refs\/heads\//, "") : await detached(cwd, on), ahead, behind, repo: JSON.stringify([on, repo]), linked: repo !== `${top}/.git`, gh: origin.code === 0 ? githubRepo(origin.stdout) : null };
    view.git[key] = info;
    if (!on) watch(view, repo, cx);
  } catch {
    // Couldn't ask (the machine is away): keep what it showed, look again later.
    view.git[key] ??= null;
    view.unsure.add(key);
  }
}

function watch(view, repo, cx) {
  if (view.watching.has(repo)) return;
  const pending = watchFolder(repo);
  view.watching.set(repo, pending);
  cx.spawn(async (cx) => {
    let current = pending;
    try {
      for (;;) {
        await current;
        if (view.watching.get(repo) !== current) return;
        const mine = JSON.stringify([null, repo]);
        const keys = Object.keys(view.git).filter((k) => view.git[k]?.repo === mine);
        if (!keys.length) break;
        refreshGit(view, keys, cx);
        current = watchFolder(repo);
        view.watching.set(repo, current);
      }
    } catch {}
    if (view.watching.get(repo) === current) view.watching.delete(repo);
  });
}

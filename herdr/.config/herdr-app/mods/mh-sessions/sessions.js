// Claude sessions by folder, and resuming one: on the machine it ran on, in its space
// or one for its folder there, its worktree made again when it's gone; or brought from
// another machine to this one (bring) and resumed here. And starting a new one in a repo,
// in a worktree or not, on a PR's branch (startNew).

import { spaces, panes, terminals, shared, setShared, run, exec, home } from "herdr";

export const inside = (p, dir) => p === dir || p.startsWith(dir + "/");
export const base = (path) => path.replace(/\/+$/, "").split("/").pop();
export const tilde = (path) => (path.startsWith(home()) ? `~${path.slice(home().length)}` : path);
export const ago = (s) => {
  const d = Date.now() / 1000 - s;
  return d < 3600 ? `${Math.max(1, Math.round(d / 60))}m` : d < 86400 ? `${Math.round(d / 3600)}h` : d < 86400 * 60 ? `${Math.round(d / 86400)}d` : `${Math.round(d / 86400 / 30)}mo`;
};

// A workspace Claude Code's WorktreeCreate hook makes: <repo>/.claude/worktrees/<name>.
export function worktree(cwd) {
  const m = cwd.match(/^(.*)\/\.claude\/worktrees\/([^/]+)/);
  return m ? { repo: m[1], name: m[2], root: m[0] } : null;
}

// "rekkert › guest-limits" for a workspace kept inside or beside its repo, else the folder's name.
export function label(cwd) {
  const claude = worktree(cwd);
  if (claude) return `${base(claude.repo)} › ${claude.name}`;
  const herdr = cwd.match(/\/\.herdr\/workspaces\/([^/]+)\/([^/]+)/);
  if (herdr) return `${herdr[1]} › ${herdr[2]}`;
  return base(cwd) || cwd;
}

export function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}

async function root(dir, on) {
  const r = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: dir, on }).catch(() => null);
  return r?.code === 0 ? r.stdout.trim() : dir;
}

async function spaceFor(cwd, on) {
  const target = await root(cwd, on);
  const ps = panes();
  for (const s of spaces()) {
    const at = (s.machine ?? null) === on && place(s, ps);
    if (at && inside(at, target) && (await root(at, on)) === target) return s;
  }
  return null;
}

// The folders among dirs that don't exist (on that machine).
export async function missing(dirs, on = null) {
  if (!dirs.length) return new Set();
  const r = await exec("sh", ["-c", 'for d; do [ -d "$d" ] || printf "%s\\n" "$d"; done', "sh", ...dirs], { on });
  return new Set(r.stdout.split("\n").filter(Boolean));
}

// A removed .claude/worktrees worktree made again on its branch (Claude's
// worktree-<name>, else <name>). null when there's no such branch or its repo is gone.
async function revive(cwd, on) {
  const w = worktree(cwd);
  if (!w || (await missing([w.repo], on)).size) return null;
  const git = (args) => exec("git", args, { cwd: w.repo, on, timeout: 600_000 });
  await git(["worktree", "prune"]);
  for (const b of [`worktree-${w.name}`, w.name]) {
    if ((await git(["show-ref", "--verify", "--quiet", `refs/heads/${b}`])).code !== 0) continue;
    if ((await git(["worktree", "add", w.root, b])).code !== 0) return null;
    const inner = w.root + cwd.slice(w.root.length);
    return (await missing([inner], on)).size ? w.root : inner;
  }
  return null;
}

// The repo a removed workspace was in, else the nearest folder above cwd that exists.
async function nearest(cwd, on) {
  let dir = worktree(cwd)?.repo ?? cwd;
  while (dir && (await missing([dir], on)).size) dir = dir.slice(0, dir.lastIndexOf("/"));
  return dir || null;
}

// The live terminal running session id on any machine (one brought here is the same session).
export const runningIn = (id) => terminals().find((t) => t.state === "live" && t.labels?.["claude.session"] === id);

// Resumes { id, cwd, machine?, space? } on its machine (null: this one), in its space
// while that's open, or goes to it wherever it's running. here: when the session's folder
// is gone, resume in its repo rather than remaking it. "" or what went wrong.
export async function resume(rec, here = false) {
  const on = rec.machine ?? null;
  const running = runningIn(rec.id);
  if (running) {
    run("agent.focus", { terminal: running.address });
    return "";
  }
  let cwd = rec.cwd;
  if ((await missing([cwd], on)).size) {
    try {
      cwd = (!here && (await revive(cwd, on))) || (await nearest(cwd, on));
    } catch (error) {
      return error.message;
    }
    if (!cwd) return `${tilde(rec.cwd)} no longer exists${on ? ` on ${on}` : ""}.`;
  }
  const argv = ["claude", "--resume", rec.id];
  const s = spaces().find((s) => s.id === rec.space) ?? (await spaceFor(cwd, on));
  if (s) {
    run("space.select", { id: s.id });
    run("tab.new", { space: s.id, folder: cwd, argv });
  } else run("space.new", { folder: cwd, machine: on ?? "", argv });
  forget(rec.id);
  return "";
}

// A new Claude session in the repo at `path` on `machine` (null: this computer), in the
// checkout itself or in a worktree of its own named `name`: made with git worktree add
// first, then taken over by Claude with --worktree. Moved to `branch` (a PR's) first when
// there's one. The spaces sidebar links it to `url` once it runs (shared("board.link.ask")).
// "" or what went wrong.
export async function startNew({ path, machine, worktree: own, name, branch, url }) {
  const on = machine ?? null;
  if ((await missing([path], on)).size) return `${tilde(path)} isn't there${on ? ` on ${on}` : ""}.`;
  const why = (r) => (r.stderr || r.stdout || "").trim().split("\n").pop() || `exit ${r.code}`;
  const git = (args) => exec("git", args, { cwd: path, on, timeout: 600_000 });
  if (branch) {
    const r = await git(["fetch", "origin", branch]);
    if (r.code !== 0) return `Couldn't fetch ${branch}: ${why(r)}`;
  }
  let cwd = path;
  if (own) {
    // Made where `claude --worktree` makes its own, so Claude takes it over.
    cwd = `${path}/.claude/worktrees/${branch ? branch.replace(/[^\w.-]/g, "-") : name}`;
    // One that is there already (kept at the end of an earlier session) is used again.
    if ((await missing([cwd], on)).size) {
      if (branch) await git(["branch", "--track", branch, `origin/${branch}`]);
      const r = await git(branch ? ["worktree", "add", cwd, branch] : ["worktree", "add", "-b", `worktree-${base(cwd)}`, cwd]);
      if (r.code !== 0) return `Couldn't make the worktree: ${why(r)}`;
    }
    const common = await git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    if (common.code === 0) await exec("sh", ["-c", 'grep -qxF "$2" "$1" 2>/dev/null || echo "$2" >>"$1"', "sh", `${common.stdout.trim()}/info/exclude`, "/.claude/worktrees/"], { on });
  }
  if (branch && !own) {
    const r = await git(["switch", branch]);
    if (r.code !== 0) return `Couldn't move to ${branch}: ${why(r)}`;
  }
  if (branch) {
    // A local branch from before does not follow the fetch: without this, the session reads old code.
    const at = (args) => exec("git", args, { cwd, on, timeout: 600_000 });
    if ((await at(["merge", "--ff-only", `origin/${branch}`])).code !== 0) {
      // Force-pushed. Moved to origin only when nothing here is lost: HEAD is an old tip of origin (fork-point reads its reflog) and there are no changes.
      const [fork, head, dirty] = await Promise.all([at(["merge-base", "--fork-point", `origin/${branch}`, "HEAD"]), at(["rev-parse", "HEAD"]), at(["status", "--porcelain"])]);
      if (fork.code !== 0 || head.code !== 0 || dirty.code !== 0 || fork.stdout.trim() !== head.stdout.trim() || dirty.stdout.trim())
        return `${branch} differs from origin and has commits or changes of its own in ${tilde(cwd)}. Update it by hand.`;
      const r = await at(["reset", "--hard", `origin/${branch}`]);
      if (r.code !== 0) return `Couldn't move ${branch} to origin: ${why(r)}`;
    }
  }
  const known = terminals().map((t) => t.address);
  const argv = own ? ["claude", "--worktree", base(cwd)] : ["claude"];
  const s = own ? null : await spaceFor(path, on);
  if (s) {
    run("space.select", { id: s.id });
    run("tab.new", { space: s.id, folder: path, argv });
  } else run("space.new", { folder: path, machine: on ?? "", argv });
  if (url) setShared("board.link.ask", [...(shared("board.link.ask") ?? []), { url, cwd, machine: on, known, at: Date.now() }]);
  return "";
}

// Where a path on machine `from` is here: the same place under a space folder's path
// here (the one named the same, else in the same place) as under its path there, else
// under this home as under that machine's.
function localPath(path, from) {
  const sf = shared("space-folders") ?? {};
  let best = null;
  for (const f of sf.folders ?? []) {
    const theirs = f.paths?.[from]?.paths ?? [];
    const mine = f.paths?.[""]?.paths ?? [];
    const at = theirs.findIndex((d) => inside(path, d));
    if (at === -1 || !mine.length || theirs[at].length <= (best?.dir.length ?? -1)) continue;
    const dir = theirs[at];
    best = { dir, to: mine.find((d) => base(d) === base(dir)) ?? mine[at] ?? mine[0] };
  }
  if (best) return best.to + path.slice(best.dir.length);
  const theirs = sf.homes?.[from];
  return theirs && inside(path, theirs) ? home() + path.slice(theirs.length) : null;
}

const stamp = 'f=$(ls -t "$HOME"/.claude/projects/*/"$1".jsonl 2>/dev/null | head -n 1); [ -n "$f" ] && printf "%s\\t%s" "$(date -r "$f" +%s)" "$f"';
const pack = 'cd "$(dirname "$1")" && tar czf - "$2.jsonl" $(test -d "$2" && echo "$2") | base64';
const unpack = 'PATH="$HOME/.local/bin:$PATH"; mkdir -p "$3" && hc exec --on "$1" --timeout 600 -- sh -c "$4" sh "$2" "$5" | base64 -d | tar xzf - -C "$3"';

// A session from another machine copied here (its transcript and subagents', unless
// this one's is as new) into the folder its own maps to here, its workspace made here
// when only the other machine has it (here: its repo instead), and resumed here. "" or
// what went wrong.
export async function bring(rec, here = false) {
  const from = rec.machine;
  if (!from) return resume(rec, here);
  const mapped = localPath(rec.cwd, from);
  if (!mapped) return `No folder here for ${rec.cwd} on ${from}.`;
  let cwd = mapped;
  if ((await missing([mapped])).size) {
    try {
      cwd = (!here && (await revive(mapped, null))) || (await nearest(mapped, null));
    } catch (error) {
      return error.message;
    }
  }
  if (!cwd) return `${tilde(mapped)} isn't here.`;
  const dest = `${home()}/.claude/projects/${cwd.replace(/[^A-Za-z0-9]/g, "-")}`;
  const file = `${dest}/${rec.id}.jsonl`;
  const [there, mine] = await Promise.all([exec("sh", ["-c", stamp, "sh", rec.id], { on: from }), exec("sh", ["-c", 'date -r "$1" +%s 2>/dev/null', "sh", file])]);
  const [at, path] = there.stdout.split("\t");
  if (!path) return `${from} no longer has this session.`;
  if (!(Number(mine.stdout.trim()) >= Number(at))) {
    const r = await exec("sh", ["-c", unpack, "sh", from, path, dest, pack, rec.id], { timeout: 600_000 });
    if (r.code !== 0 || (await exec("test", ["-f", file])).code !== 0) return `Couldn't copy it from ${from}: ${(r.stderr || "").trim().split("\n").pop() || `exit ${r.code}`}`;
  }
  return resume({ id: rec.id, cwd, machine: null });
}

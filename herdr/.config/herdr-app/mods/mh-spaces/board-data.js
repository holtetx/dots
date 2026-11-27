// The board's data, asked of GitHub with gh. Settings: shared("mh-board").

import { exec, shared } from "herdr";
import { githubRepo, graphql, ISSUE, itemOf, PR, REVIEW_FIELDS, reviewsOf } from "./github.js";
import { offHead, worktreesOf } from "./stack.js";

const BOARD_DEFAULTS = { repos: [], skip: [], hide: [] };
const boardSettings = () => ({ ...BOARD_DEFAULTS, ...(shared("mh-board") ?? {}) });

export function boardRepos() {
  const cfg = boardSettings();
  const skip = new Set(cfg.skip.map((r) => r.toLowerCase()));
  const seen = new Set();
  return [...cfg.repos, ...(shared("board.repos") ?? []).filter((r) => !skip.has(r.toLowerCase()))].filter((r) => {
    const k = r.toLowerCase();
    return !hidden(r) && !seen.has(k) && seen.add(k);
  });
}

const PR_FIELDS = `${PR} ${REVIEW_FIELDS} body updatedAt headRefOid isCrossRepository totalCommentsCount additions deletions closingIssuesReferences(first: 10) { nodes { url } }`;
const ISSUE_FIELDS = `${ISSUE} body updatedAt author { login } assignees(first: 3) { nodes { login } } labels(first: 6) { nodes { name color } } closedByPullRequestsReferences(first: 5) { nodes { url } }`;
const repoArgs = (repo) => {
  const [owner, name] = repo.split("/");
  return `owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}`;
};
const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

// One query per chunk of repos, all at once: { data per repo, repos GitHub didn't know }.
async function perRepo(repos, size, field, head = "") {
  const out = { data: [], missing: [], failed: false, head: null };
  await Promise.all(
    chunks(repos, size).map(async (chunk, c) => {
      const data = await graphql([c === 0 ? head : "", ...chunk.map((r, i) => `r${i}: repository(${repoArgs(r)}) { ${field} }`)].join("\n")).catch(() => null);
      if (!data) return (out.failed = true);
      if (c === 0) out.head = data;
      chunk.forEach((r, i) => (data[`r${i}`] ? out.data.push(data[`r${i}`]) : out.missing.push(r)));
    }),
  );
  if (!repos.length && head) out.head = await graphql(head).catch(() => null);
  return out;
}

function prOf(n, at, login) {
  return {
    ...itemOf(n, at),
    author: n.author?.login ?? "",
    mine: Boolean(login) && n.author?.login === login,
    updated: Date.parse(n.updatedAt) || 0,
    ...reviewsOf(n),
    comments: n.totalCommentsCount ?? 0,
    additions: n.additions ?? 0,
    deletions: n.deletions ?? 0,
    checks: n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null,
    oid: n.headRefOid ?? null,
    fork: Boolean(n.isCrossRepository),
  };
}

// mh-board.hide: parts of owner/repo names never shown, for repos where my team is the reviewer but I do not work.
const hidden = (repo) => boardSettings().hide.some((h) => repo.toLowerCase().includes(h.toLowerCase()));
const search = (q) => `search(query: ${JSON.stringify(q)}, type: ISSUE, first: 100) { nodes { ... on PullRequest { ${PR_FIELDS} } } }`;

// { login, prs, missing }: every open PR in `repos` and on GitHub involving you, each
// with rr (your review is asked for), inv (it involves you) and mine.
export async function fetchPrs(repos) {
  // One gh call each: together GitHub answers 502 when the searches are large.
  const ask = (fields) => graphql(fields).catch(() => null);
  const [rr, inv, r] = await Promise.all([
    ask(`viewer { login } rr: ${search("is:pr is:open archived:false review-requested:@me")}`),
    ask(`viewer { login } inv: ${search("is:pr is:open archived:false involves:@me")}`),
    perRepo(repos, 20, `pullRequests(states: OPEN, first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { ${PR_FIELDS} } }`, "viewer { login }"),
  ]);
  if (!rr && !inv && (r.failed || !repos.length)) throw new Error("Couldn't ask GitHub about PRs: is gh logged in?");
  if (!rr || !inv) r.failed = true;
  const login = (rr ?? inv ?? r.head)?.viewer?.login ?? "";
  r.head = { rr: rr?.rr, inv: inv?.inv };
  const at = Date.now();
  const prs = {};
  const add = (n, flag) => {
    if (!n?.url || hidden(n.repository?.nameWithOwner ?? "")) return;
    prs[n.url] ??= prOf(n, at, login);
    if (flag) prs[n.url][flag] = true;
  };
  for (const n of r.head.rr?.nodes ?? []) add(n, "rr");
  for (const n of r.head.inv?.nodes ?? []) add(n, "inv");
  for (const d of r.data) for (const n of d.pullRequests?.nodes ?? []) add(n);
  await markBehind(Object.values(prs));
  return { login, prs: Object.values(prs), missing: r.missing, partial: r.failed };
}

// Sets `behind` on the PRs with a checkout here that does not have the PR's newest commit (new commits or a force-push).
async function markBehind(prs) {
  const places = shared("board.places") ?? {};
  await Promise.all(
    Object.entries(places).map(async ([repo, at]) => {
      const mine = prs.filter((p) => p.repo.toLowerCase() === repo.toLowerCase());
      for (const { path, machine } of mine.length ? at : []) {
        const git = (args) => exec("git", args, { cwd: path, on: machine ?? null, timeout: 20000 }).catch(() => null);
        const list = await git(["worktree", "list", "--porcelain"]);
        if (list?.code !== 0) continue;
        const worktrees = worktreesOf(list.stdout);
        for (const p of mine)
          for (const w of offHead(p, worktrees)) {
            // A checkout that has the PR's commit and more is ahead, not behind.
            if ((await git(["merge-base", "--is-ancestor", p.oid, w.head]))?.code !== 0) p.behind = true;
          }
      }
    }),
  );
}

// { login, issues, missing }: every open issue in `repos`.
export async function fetchIssues(repos) {
  const r = await perRepo(repos, 15, `issues(states: OPEN, first: 100, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { ${ISSUE_FIELDS} } }`, "viewer { login }");
  if (!r.head && repos.length) throw new Error("Couldn't ask GitHub about issues: is gh logged in?");
  const login = r.head?.viewer?.login ?? "";
  const at = Date.now();
  const issues = r.data.flatMap((d) =>
    (d.issues?.nodes ?? []).map((n) => ({
      ...itemOf(n, at),
      author: n.author?.login ?? "",
      assignees: (n.assignees?.nodes ?? []).map((a) => a.login),
      labels: (n.labels?.nodes ?? []).map((l) => ({ name: l.name, color: l.color })),
      updated: Date.parse(n.updatedAt) || 0,
    })),
  );
  return { login, issues, missing: r.missing, partial: r.failed };
}

// For each path, its own origin when it's a repo, else those of the repos right inside it:
// "<path>\t<origin>" lines.
const FIND = `origin() {
  u=$(git -C "$1" remote get-url origin 2>/dev/null)
  if [ -n "$u" ]; then printf '%s\\t%s\\n' "$1" "$u"; fi
}
for d; do
  if [ -e "$d/.git" ]; then origin "$d"
  else for c in "$d"/*/; do if [ -e "$c.git" ]; then origin "\${c%/}"; fi; done; fi
done; true`;

// The GitHub repos in the sidebar's folders on machine `on` (null: this one), and where
// each is: [{ repo: "owner/repo", path }].
export async function discoverRepos(folders, on) {
  const paths = [...new Set(folders.flatMap((f) => f.paths?.[on ?? ""]?.paths ?? []))];
  if (!paths.length) return [];
  const r = await exec("sh", ["-c", FIND, "sh", ...paths], { on, timeout: 30000 });
  return r.stdout.split("\n").map((line) => {
    const [path, url] = line.split("\t");
    const repo = githubRepo(url);
    return repo ? { repo, path } : null;
  }).filter(Boolean);
}

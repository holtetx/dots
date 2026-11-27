// GitHub PRs and issues for the sidebar (from transcripts' "pr-link" lines and branches), with their state from one GraphQL query.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, shared, setShared } from "herdr";
import { GRAY, GREEN, PURPLE, RED, YELLOW } from "./jira.js";
import { darkOf } from "./pixel.js";
import { rollupState } from "./checks-data.js";
export { githubRepo } from "./remote.js";

export const PR = "__typename url number title state isDraft isInMergeQueue reviewDecision headRefName baseRefName repository { nameWithOwner } commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }";
export const ISSUE = "__typename url number title state stateReason repository { nameWithOwner }";
const PR_LINKED = `${PR} body closingIssuesReferences(first: 10) { nodes { ${ISSUE} body } }`;
const ISSUE_LINKED = `${ISSUE} body closedByPullRequestsReferences(first: 10, includeClosedPrs: true) { nodes { ${PR} body } }`;
const NODE = `__typename ... on PullRequest { ${PR_LINKED} } ... on Issue { ${ISSUE_LINKED} }`;

const linkedOf = (n) => (n.closingIssuesReferences ?? n.closedByPullRequestsReferences)?.nodes ?? [];

// Merge-queued is the attention yellow.
export const GH = {
  open: { icon: "mods/mh-spaces/git-pull-request.svg", color: GREEN, label: "Open" },
  draft: { icon: "mods/mh-spaces/git-pull-request-draft.svg", color: GRAY, label: "Draft" },
  queued: { icon: "mods/mh-spaces/git-pull-request.svg", color: YELLOW, label: "Merge queued" },
  merged: { icon: "mods/mh-spaces/git-merge.svg", color: PURPLE, label: "Merged" },
  closed: { icon: "mods/mh-spaces/git-pull-request-closed.svg", color: RED, label: "Closed" },
  "issue-open": { icon: "mods/mh-spaces/circle-dot.svg", color: GREEN, label: "Open" },
  "issue-done": { icon: "mods/workspace-chrome/circle-check.svg", color: PURPLE, label: "Closed" },
  "issue-skip": { icon: "mods/mh-spaces/circle-slash.svg", color: GRAY, label: "Not planned" },
};
export const FINAL = new Set(["merged", "closed", "issue-done", "issue-skip"]);
export const stateMarks = (t) => [
  [["open", "draft", "queued", "merged", "closed"], "PR: open, draft, merge queued, merged, closed"],
  [["issue-open", "issue-done", "issue-skip"], "issue: open, closed, not planned"],
].map(([states, text]) => [h_flex().gap(6).children(states.map((s) => svg(GH[s].icon).size(12).text_color(colorOf(GH[s], t)))), text]);
export const CHECK_LOOK = {
  failed: { icon: "mods/pr/circle-x.svg", color: RED, label: "CI failed" },
  running: { icon: "mods/pr/circle-dot.svg", color: YELLOW, label: "CI running" },
  passed: { icon: "mods/pr/circle-check.svg", color: GREEN, label: "CI passed" },
  skipped: { icon: "mods/pr/circle-minus.svg", color: GRAY, label: "Skipped" },
};
const ciOf = (it) => (it?.kind === "pr" && !FINAL.has(it.state) ? CHECK_LOOK[it.ci] ?? null : null);
const REVIEW = {
  APPROVED: { icon: "mods/workspace-chrome/check.svg", color: GREEN, label: "Approved" },
  CHANGES_REQUESTED: { icon: "mods/mh-spaces/file-diff.svg", color: RED, label: "Changes requested" },
};

export const prKey = (it) => (it?.kind === "pr" && it.repo && it.number ? `${it.repo}#${it.number}`.toLowerCase() : null);
const reviewOf = (it) => (it && GH[it.state] && !FINAL.has(it.state) ? REVIEW[it.review] ?? null : null);
const unreadOf = (it) => shared("github")?.unread?.[prKey(it)] ?? null;

// The PRs opened from a badge: their news is read, until there's newer (mh-spaces keeps it).
export function markRead(its) {
  const read = its.map((it) => [prKey(it), unreadOf(it)]).filter(([, u]) => u).map(([key, u]) => ({ key, at: u.at }));
  if (read.length) setShared("github.read.ask", [...(shared("github.read.ask") ?? []), ...read]);
}

export function stateOf(n) {
  if (n.__typename === "Issue") return n.state === "OPEN" ? "issue-open" : n.stateReason === "NOT_PLANNED" ? "issue-skip" : "issue-done";
  if (n.state === "MERGED") return "merged";
  if (n.state === "CLOSED") return "closed";
  return n.isInMergeQueue ? "queued" : n.isDraft ? "draft" : "open";
}

const parseUrl = (url) => url.match(/github\.com\/([^/]+\/[^/]+)\/(pull|issues)\/(\d+)/);

export function itemOf(n, at) {
  return { kind: n.__typename === "Issue" ? "issue" : "pr", url: n.url, repo: n.repository?.nameWithOwner ?? "", number: n.number, title: n.title ?? "", state: stateOf(n), review: n.reviewDecision ?? null, at, links: linkedOf(n).map((l) => l.url), ...(n.__typename === "Issue" ? {} : { branch: n.headRefName ?? null, base: n.baseRefName ?? null, ci: rollupState(n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state) }) };
}

// A node and those it's linked to, into `items`. Those come without `links` of their
// own (one hop), so they don't replace one asked about directly.
function collect(n, at, items) {
  items[n.url] = itemOf(n, at);
  for (const l of linkedOf(n)) {
    if (items[l.url]?.links) continue;
    const { links: _, ...it } = itemOf(l, at);
    items[l.url] = it;
  }
}

// What a URL nobody could answer for shows: its number, dimmed.
export function unknown(url, at) {
  const m = parseUrl(url);
  return { kind: m?.[2] === "issues" ? "issue" : "pr", url, repo: m?.[1] ?? "", number: Number(m?.[3]) || null, title: "", state: "unknown", at, links: [] };
}

function tipOf(it, s) {
  return [`${it.repo}#${it.number ?? "?"}`, s?.label, reviewOf(it)?.label, ciOf(it)?.label, unreadOf(it) && "New activity", it.title].filter(Boolean).join(" · ");
}

export const prsOf = (id, gh) => (gh.shown?.spaces?.[id] ?? []).filter((u) => (gh.items?.[u] ?? unknown(u, 0)).kind === "pr");

// `g`: shared("git.spaces")[id].
export function branchPr(id, g, gh) {
  const mine = prsOf(id, gh).map((u) => gh.items?.[u]).filter((it) => it?.branch === g.branch && it.base && it.repo?.toLowerCase() === g.gh?.toLowerCase());
  return mine.find((it) => it.state === "open") ?? mine[0] ?? null;
}

// For board.js verdict().
export const REVIEW_FIELDS = "author { login } latestReviews(first: 30) { nodes { state author { login __typename } } } comments(last: 30) { nodes { author { login __typename } } }";
export function reviewsOf(n) {
  const latest = n.latestReviews?.nodes ?? [];
  return {
    approvals: latest.filter((r) => r.state === "APPROVED").length,
    changes: latest.filter((r) => r.state === "CHANGES_REQUESTED").length,
    // A person other than the author reviewed or commented, so the PR is being looked at.
    discussed: [...latest, ...(n.comments?.nodes ?? [])].some((c) => c.author && c.author.__typename !== "Bot" && c.author.login !== n.author?.login),
  };
}

export function spacePr(id) {
  const gh = shared("github") ?? {};
  const g = shared("git.spaces")?.[id];
  return (g && branchPr(id, g, gh)?.url) || (prsOf(id, gh).find((u) => gh.items?.[u]?.state === "open") ?? null);
}

// `urls`, then what they bring along: a PR's issues and an issue's PRs (`related`).
// One hop only. [{ url, via }], via: the URL it came with, null for those in `urls`.
export function expand(urls, items, { related = true } = {}) {
  const out = [];
  const seen = new Set();
  const add = (url, via) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, via });
  };
  for (const url of urls) add(url, null);
  if (related) for (const url of urls) for (const l of items[url]?.links ?? []) add(l, url);
  return out;
}

// A branch from the spaces list's label (git's branch), or null for main, master
// and "(detached)".
export function branchName(label) {
  return label && !["main", "master", "(detached)"].includes(label) && !/~\d+$|^@/.test(label) ? label : null;
}

// PR URLs Claude recorded in a session, first seen first.
export async function scanAgent(sid, on) {
  if (!/^[\w-]+$/.test(sid)) return [];
  const r = await exec("sh", ["-c", `grep -hF '"type":"pr-link"' "$HOME"/.claude/projects/*/"$1".jsonl 2>/dev/null; true`, "sh", sid], { on });
  const urls = [];
  for (const line of r.stdout.split("\n")) {
    try {
      const url = JSON.parse(line).prUrl;
      if (url && !urls.includes(url)) urls.push(url);
    } catch {}
  }
  return urls;
}

export async function graphql(fields) {
  const r = await exec("gh", ["api", "graphql", "-f", `query=query { ${fields} }`], { timeout: 30000 });
  // A missing PR or repo is an error beside the rest of the data, and gh exits 1.
  const data = JSON.parse(r.stdout || "null")?.data ?? null;
  // No data at all (logged out, an expired token, no network): say why.
  if (!data && r.code !== 0) throw new Error((r.stderr || r.stdout || `gh exited ${r.code}`).trim());
  return data;
}

// A repo's open PRs, yours first, then the most recently updated.
export async function openPrs(repo) {
  const [owner, name] = repo.split("/");
  const data = await graphql(`viewer { login } r: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { pullRequests(states: OPEN, first: 100, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { ${PR} author { login } } } }`);
  if (!data?.r) throw new Error(`Couldn't list ${repo}'s open PRs.`);
  const at = Date.now();
  const prs = data.r.pullRequests.nodes.map((n) => ({ ...itemOf(n, at), author: n.author?.login ?? "", mine: n.author?.login === data.viewer?.login }));
  return [...prs.filter((p) => p.mine), ...prs.filter((p) => !p.mine)];
}

// A PR or issue from what someone typed: its URL, owner/repo#12, or #12 in `repo`.
export async function resolve(text, repo) {
  const s = text.trim();
  const m = s.match(/github\.com\/([^/\s]+)\/([^/\s]+)\/(?:pull|issues)\/(\d+)/) ?? s.match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/);
  const short = s.match(/^#?(\d+)$/);
  if (!m && !(short && repo)) throw new Error(short ? "This space isn't in a GitHub repo: paste a URL or owner/repo#12." : "Paste a PR or issue URL, owner/repo#12 or #12.");
  const [owner, name, number] = m ? m.slice(1) : [...repo.split("/"), short[1]];
  const data = await graphql(`r: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { issueOrPullRequest(number: ${Number(number)}) { ${NODE} } }`);
  const n = data?.r?.issueOrPullRequest;
  if (!n) throw new Error(`${owner}/${name}#${number} isn't on GitHub, or gh can't see it.`);
  return itemOf(n, Date.now());
}

// The PRs GitHub has unread notifications about, by prKey: { id, reason, at (ms) }.
// CI runs and merges or closes aren't news: the badge's own state says those.
export async function fetchUnread() {
  const q = '.[] | select(.subject.type == "PullRequest" and .reason != "ci_activity" and .reason != "state_change") | {id, url: .subject.url, reason, at: .updated_at} | tojson';
  const r = await exec("gh", ["api", "notifications", "--paginate", "-q", q], { timeout: 30000 });
  if (r.code !== 0) throw new Error((r.stderr || "gh api notifications failed").trim());
  const out = {};
  for (const line of r.stdout.split("\n")) {
    try {
      const n = JSON.parse(line);
      const m = n.url?.match(/\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)$/);
      if (m) out[`${m[1]}#${m[2]}`.toLowerCase()] = { id: n.id, reason: n.reason, at: Date.parse(n.at) || 0 };
    } catch {}
  }
  return out;
}

// Each URL's state, and each { repo, branch }'s newest PR (an open one first).
// ok: false, with error, when GitHub couldn't be asked at all.
export async function fetchGitHub(urls, branches) {
  const at = Date.now();
  const out = { items: {}, branches: {}, ok: true };
  const parts = [
    ...urls.map((url) => ({
      q: `resource(url: ${JSON.stringify(url)}) { ${NODE} }`,
      done: (d) => (d?.number ? collect(d, at, out.items) : (out.items[url] = unknown(url, at))),
    })),
    ...branches.map(({ key, repo, branch }) => {
      const [owner, name] = repo.split("/");
      return {
        q: `repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { pullRequests(headRefName: ${JSON.stringify(branch)}, first: 5, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { ${PR_LINKED} } } }`,
        done: (d) => {
          const nodes = d?.pullRequests?.nodes ?? [];
          const pr = nodes.find((n) => n.state === "OPEN") ?? nodes[0];
          out.branches[key] = pr?.url ?? null;
          if (pr) collect(pr, at, out.items);
        },
      };
    }),
  ];
  for (let i = 0; i < parts.length; i += 40) {
    const chunk = parts.slice(i, i + 40);
    let data = null;
    try { data = await graphql(chunk.map((p, j) => `a${j}: ${p.q}`).join("\n")); } catch (e) { out.error = String(e?.message ?? e); }
    if (!data) { out.ok = false; continue; }
    chunk.forEach((p, j) => p.done(data[`a${j}`]));
  }
  return out;
}

// Only https: links come from GitHub, Jira and hand-added docs, and `open` runs files and apps too.
export const open = (url, cx) => /^https:\/\//.test(url ?? "") && cx.spawn(async () => { await exec("open", [url]).catch(() => null); });
const iconOf = (it, s) => s?.icon ?? (it.kind === "issue" ? GH["issue-open"].icon : GH.open.icon);
const colorOf = (s, t) => (s ? s.color[darkOf(t) ? 1 : 0] : t.dim);

// The icon, with a yellow square when there's news, and the lead PR's review and CI after it.
function marks(el, it, s, news, t) {
  const review = reviewOf(it), ci = ciOf(it);
  return el
    .child(div().relative().flex_none().child(svg(iconOf(it, s)).size(11))
      .when(news, (d) => d.child(div().absolute().top(-2).right(-3).size(4).bg(t.ansi3))))
    .when(Boolean(review), (el) => el.child(div().flex_none().text_color(colorOf(review, t)).child(svg(review.icon).size(10))))
    .when(Boolean(ci), (el) => el.child(div().flex_none().text_color(colorOf(ci, t)).child(svg(ci.icon).size(10))));
}

// A state-colored icon with its number, for the link dialog; a click opens the link.
export function badge(url, items, t, id) {
  const it = items[url] ?? unknown(url, 0);
  const s = GH[it.state];
  return h_flex()
    .id(id)
    .flex_none()
    .gap(2)
    .items_center()
    .text_size(11)
    .text_color(colorOf(s, t))
    .cursor_pointer()
    .tooltip(tipOf(it, s))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => { cx.stop_propagation(); markRead([it]); open(url, cx); })
    .map((el) => marks(el, it, s, Boolean(unreadOf(it)), t))
    .child(String(it.number ?? "?"));
}

// One icon per kind (PR, issue), in the state of the one most worth a
// look (open before done, known before unknown, news first), with how many when more
// than one. A click opens the link, or calls `many` (the link dialog) when there are several.
export function kinds(urls, items, t, id, many) {
  const rank = (u) => (!GH[items[u]?.state] ? 4 : FINAL.has(items[u].state) ? 2 : 0) + (unreadOf(items[u]) ? 0 : 1);
  const groups = ["pr", "issue"].map((kind) => urls.filter((u) => (items[u] ?? unknown(u, 0)).kind === kind)).filter((g) => g.length);
  return h_flex()
    .flex_none()
    .gap(6)
    .items_center()
    .children(groups.map((g) => {
      const lead = g.reduce((a, b) => (rank(b) < rank(a) ? b : a));
      const it = items[lead] ?? unknown(lead, 0);
      const s = GH[it.state];
      return h_flex()
        .id(`${id}-${it.kind}`)
        .flex_none()
        .gap(2)
        .items_center()
        .text_size(11)
        .text_color(colorOf(s, t))
        .cursor_pointer()
        .tooltip(g.map((u) => { const x = items[u] ?? unknown(u, 0); return tipOf(x, GH[x.state]); }).join("\n"))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => {
          cx.stop_propagation();
          if (g.length > 1) return many();
          markRead([it]);
          open(lead, cx);
        })
        .map((el) => marks(el, it, s, g.some((u) => unreadOf(items[u])), t))
        .when(g.length > 1, (el) => el.child(String(g.length)));
    }));
}

import { appHome, exec, readTextFile } from "herdr";
import * as fs from "fs/promises";
import { graphql, stateOf } from "./github.js";

const WHO = "author { login __typename }";
const TEXT = `${WHO} body bodyHTML url createdAt`;
const COMMON = `__typename url number title state ${WHO} createdAt body bodyHTML repository { nameWithOwner }
  labels(first: 10) { nodes { name } } assignees(first: 5) { nodes { login } } comments(last: 50) { nodes { ${TEXT} } }`;
const PR = `${COMMON} isDraft isInMergeQueue reviewDecision mergeStateStatus headRefName baseRefName additions deletions changedFiles
  latestReviews(first: 30) { nodes { ${WHO} state } }
  reviews(last: 30) { nodes { ${TEXT} state } }
  reviewThreads(last: 50) { nodes { isResolved path line comments(first: 20) { nodes { ${TEXT} } } } }
  closingIssuesReferences(first: 10) { nodes { url number title } }
  commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { nodes { __typename
    ... on CheckRun { name status conclusion detailsUrl startedAt checkSuite { workflowRun { workflow { name } } } }
    ... on StatusContext { context state targetUrl createdAt } } } } } } }`;
const ISSUE = `${COMMON} stateReason closedByPullRequestsReferences(first: 10, includeClosedPrs: true) { nodes { url number title } }`;

const RUN = { SUCCESS: "passed", NEUTRAL: "skipped", SKIPPED: "skipped", STALE: "skipped" };
const STATUS = { SUCCESS: "passed", PENDING: "running", EXPECTED: "running" };
const CHECK_ORDER = { failed: 0, running: 1, passed: 2, skipped: 3 };
const MERGE = { BEHIND: "behind base", DIRTY: "conflicts", BLOCKED: "blocked", UNSTABLE: "checks failing", CLEAN: "ready to merge", HAS_HOOKS: "ready to merge" };
export const REVIEW_WORD = { APPROVED: "approved", CHANGES_REQUESTED: "changes", COMMENTED: "commented", DISMISSED: "dismissed", PENDING: "pending" };

function checksOf(n) {
  const list = n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes ?? [];
  const newest = {};
  for (const c of list) {
    const run = c.__typename === "CheckRun";
    const it = run
      ? { name: c.name, url: c.detailsUrl, state: c.status !== "COMPLETED" ? "running" : RUN[c.conclusion] ?? "failed", at: Date.parse(c.startedAt) || Infinity }
      : { name: c.context, url: c.targetUrl, state: STATUS[c.state] ?? "failed", at: Date.parse(c.createdAt) || Infinity };
    const key = `${run ? c.checkSuite?.workflowRun?.workflow?.name ?? "" : "status"}/${it.name}`;
    if (!newest[key] || it.at >= newest[key].at) newest[key] = it;
  }
  return Object.values(newest)
    .sort((a, b) => CHECK_ORDER[a.state] - CHECK_ORDER[b.state] || a.name.localeCompare(b.name));
}

const unescape = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const MEDIA = /!\[[^\]]*\]\(<?(\S+?)>?(?:\s+"[^"]*")?\)|<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>|^[ \t]*(https:\/\/github\.com\/user-attachments\/assets\/\S+)[ \t]*$/gm;

// GitHub's HTML has the same media in the same order, with signed URLs that work without a login.
function partsOf(md, html) {
  const badges = new Set();
  md = (md ?? "").replace(/<!--[\s\S]*?-->/g, "").replace(/\[!\[([^\]]*)\]\([^)\s]*\)\]\(([^)\s]+)\)/g, (_m, alt, href) => (badges.add(href), `[${alt || href}](${href})`));
  const signed = [...(html ?? "").matchAll(/(?:<a\b[^>]*?\bhref="([^"]*)"[^>]*>\s*)?<(img|video)\b[^>]*?\ssrc="([^"]+)"/g)]
    .filter((m) => !badges.has(unescape(m[1] ?? "")))
    .map((m) => ({ video: m[2] === "video", src: unescape(m[3]) }));
  const found = [...md.matchAll(MEDIA)];
  const same = signed.length === found.length;
  const parts = [];
  let last = 0;
  found.forEach((m, i) => {
    if (md.slice(last, m.index).trim()) parts.push({ md: md.slice(last, m.index) });
    last = m.index + m[0].length;
    const link = unescape(m[1] ?? m[2] ?? m[3]);
    const s = same ? signed[i] : null;
    parts.push((s ? s.video : m[3]) ? { video: link } : { img: s?.src ?? link, link });
  });
  if (md.slice(last).trim()) parts.push({ md: md.slice(last) });
  return parts;
}

const at = (s) => Date.parse(s) || 0;
const who = (x) => x?.author?.login ?? "ghost";
const bot = (x) => x?.author?.__typename === "Bot";

export async function fetchPreview(url) {
  const n = (await graphql(`r: resource(url: ${JSON.stringify(url)}) { ... on PullRequest { ${PR} } ... on Issue { ${ISSUE} } }`))?.r;
  if (!n?.number) throw new Error("GitHub did not answer: is gh logged in, and can it see the repo?");
  const pr = n.__typename === "PullRequest";
  const posts = [
    ...n.comments.nodes.map((c) => ({ who: who(c), bot: bot(c), what: "commented", at: at(c.createdAt), url: c.url, parts: partsOf(c.body, c.bodyHTML) })),
    ...(n.reviews?.nodes ?? []).filter((r) => r.body.trim()).map((r) => ({ who: who(r), bot: bot(r), what: `review: ${REVIEW_WORD[r.state] ?? r.state.toLowerCase()}`, at: at(r.createdAt), url: r.url, parts: partsOf(r.body, r.bodyHTML) })),
    ...(n.reviewThreads?.nodes ?? []).filter((th) => !th.isResolved && th.comments.nodes.length).map((th) => ({
      who: who(th.comments.nodes[0]), bot: bot(th.comments.nodes[0]), what: `on ${th.path}${th.line ? `:${th.line}` : ""}`, at: at(th.comments.nodes[0].createdAt), url: th.comments.nodes[0].url,
      parts: partsOf(th.comments.nodes[0].body, th.comments.nodes[0].bodyHTML),
      replies: th.comments.nodes.slice(1).map((c) => ({ who: who(c), url: c.url, parts: partsOf(c.body, c.bodyHTML) })),
    })),
  ].sort((a, b) => a.at - b.at);
  return {
    pr, url: n.url, ref: `${n.repository.nameWithOwner}#${n.number}`, title: n.title, state: stateOf(n), author: who(n), created: at(n.createdAt),
    branch: pr ? `${n.headRefName} → ${n.baseRefName}` : null,
    size: pr ? `+${n.additions} -${n.deletions} · ${n.changedFiles} file${n.changedFiles === 1 ? "" : "s"}` : null,
    merge: pr ? MERGE[n.mergeStateStatus] ?? null : null,
    reviewers: pr ? n.latestReviews.nodes.map((r) => ({ who: who(r), state: r.state })) : [],
    checks: pr ? checksOf(n) : [],
    labels: n.labels.nodes.map((l) => l.name),
    people: n.assignees.nodes.map((a) => a.login),
    linked: (pr ? n.closingIssuesReferences : n.closedByPullRequestsReferences).nodes,
    body: partsOf(n.body || "_No description._", n.bodyHTML),
    posts,
  };
}

// image() reads only inside Herdr's folder; git ignores this one.
const DIR = "mh-cache/preview";
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg" };
// Only GitHub's hosts: its HTML points other images at its own proxy, so a PR body can't make curl call a stranger.
const GITHUB_HOST = /^https:\/\/([\w-]+\.)*(github\.com|githubusercontent\.com)\//;
// Signed URLs change on each fetch; the path does not.
const keyOf = (url) => [...url.replace(/[?#].*$/, "")].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7).toString(36);
const cached = {};

export const canCache = (url) => GITHUB_HOST.test(url);

// { path, w, h } for image(), or null when it could not be had.
export function cacheImage(url) {
  const key = keyOf(url);
  cached[key] ??= download(url, key).catch(() => null).then((path) => path ?? (delete cached[key], null));
  return cached[key];
}

async function download(url, key) {
  const dir = `${appHome()}/${DIR}`;
  await fs.mkdir(dir, { recursive: true });
  const have = (await fs.readdir(dir)).find((f) => f.startsWith(`${key}.`) && !f.endsWith(".part"));
  if (have) return sized(`${DIR}/${have}`);
  const part = `${dir}/${key}.part`;
  const r = await exec("curl", ["-sfL", "--max-filesize", "20000000", "-o", part, "-w", "%{content_type}", url], { timeout: 60000 });
  const ext = r.code === 0 && EXT[r.stdout.split(";")[0].trim().toLowerCase()];
  if (!ext) return exec("rm", ["-f", part]).then(() => null);
  // Herdr's fs has no rename.
  await exec("mv", ["-f", part, `${dir}/${key}.${ext}`]);
  return sized(`${DIR}/${key}.${ext}`);
}

// image() has no fit, so the preview sizes each image itself. file(1) gives the pixels (the last WxH: JPEG names its density first).
async function sized(path) {
  if (path.endsWith(".svg")) {
    const head = (await readTextFile(`${appHome()}/${path}`))?.match(/<svg\b[^>]*>/)?.[0] ?? "";
    const size = (name) => Number(head.match(new RegExp(`\\s${name}="([\\d.]+)`))?.[1]);
    const box = head.match(/viewBox="[\d.-]+[ ,]+[\d.-]+[ ,]+([\d.]+)[ ,]+([\d.]+)"/);
    return { path, w: size("width") || Number(box?.[1]) || 120, h: size("height") || Number(box?.[2]) || 20 };
  }
  const r = await exec("file", ["-b", `${appHome()}/${path}`]);
  const [w, h] = (r.stdout.match(/(\d+) ?x ?(\d+)/g)?.at(-1) ?? "").split(/ ?x ?/).map(Number);
  return { path, w: w || 600, h: h || 300 };
}

export function pruneCache() {
  exec("find", [`${appHome()}/${DIR}`, "-type", "f", "-mtime", "+30", "-delete"]).catch(() => null);
}

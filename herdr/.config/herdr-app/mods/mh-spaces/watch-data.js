// No Herdr imports, so watch.test.mjs can load it.

import { rollupState } from "./checks-data.js";

// Separate lists: one shared timeline window fills up with commits on a long PR.
const WHO = "author { login __typename }";
export const WATCH_FIELDS = `closedAt author { login } reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
  comments(last: 30) { nodes { createdAt ${WHO} } }
  reviews(last: 30) { nodes { submittedAt state ${WHO} } }
  latestReviews(first: 20) { nodes { submittedAt state ${WHO} } }
  lastCommit: commits(last: 1) { nodes { commit { committedDate author { user { login __typename } } } } }`;

export const GONE_AFTER = 24 * 3600000;

const person = (a) => Boolean(a?.login) && a.__typename !== "Bot" && !a.login.endsWith("[bot]");

// shortcut: a commit counts at committedDate (GitHub no longer gives the push time), so a rebase looks new.
// A commit whose email is linked to no GitHub user counts as the PR author's. An approval is not news: MERGE says it.
function eventsOf(n) {
  const author = n.author?.login ? { login: n.author.login, __typename: "User" } : null;
  const commits = (n.lastCommit?.nodes ?? []).map((c) => ({ who: c.commit?.author?.user ?? author, at: c.commit?.committedDate }));
  const said = [...(n.comments?.nodes ?? []).map((c) => ({ who: c.author, at: c.createdAt })), ...(n.reviews?.nodes ?? []).filter((r) => r.state !== "APPROVED").map((r) => ({ who: r.author, at: r.submittedAt }))];
  return [...commits, ...said].flatMap((e) => (person(e.who) && Date.parse(e.at ?? "") ? [{ who: e.who.login, at: Date.parse(e.at) }] : []));
}

// { move: "you" | "wait" | "done", why }. `seen`: when its row was last opened (ms).
export function moveOf(n, login, seen = 0) {
  if (n.state === "MERGED") return { move: "done", why: "merged" };
  if (n.state === "CLOSED") return { move: "done", why: "closed" };
  if (n.isInMergeQueue) return { move: "wait", why: "queued" };
  const events = eventsOf(n);
  const last = (list) => Math.max(0, ...list.map((e) => e.at));
  const mineAt = last(events.filter((e) => e.who === login));
  const news = last(events.filter((e) => e.who !== login)) > Math.max(mineAt, seen);
  const ci = rollupState(n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state);
  const latest = (n.latestReviews?.nodes ?? []).filter((r) => person(r.author) && r.author.login !== login);
  if (n.author?.login === login) {
    if (ci === "failed") return { move: "you", why: "CI failed" };
    const asked = latest.filter((r) => r.state === "CHANGES_REQUESTED").map((r) => ({ at: Date.parse(r.submittedAt ?? "") || 0 }));
    // Stays until you answer, not until you look.
    if (n.reviewDecision !== "APPROVED" && last(asked) > mineAt) return { move: "you", why: "changes asked" };
    if (news) return { move: "you", why: "new reply" };
    // Repos that don't require reviews give no reviewDecision.
    const approved = n.reviewDecision === "APPROVED" || (!n.reviewDecision && latest.some((r) => r.state === "APPROVED"));
    if (approved && ci !== "running" && !n.isDraft) return { move: "you", why: "merge it" };
    return { move: "wait", why: n.isDraft ? "draft" : "in review" };
  }
  if ((n.reviewRequests?.nodes ?? []).some((r) => r.requestedReviewer?.login === login)) return { move: "you", why: "review asked" };
  if (news) return { move: "you", why: "new reply" };
  return { move: "wait", why: "their move" };
}

export const goneOf = (n, now) => Boolean(n && n.state !== "OPEN" && n.closedAt && now - Date.parse(n.closedAt) > GONE_AFTER);

export function shownOf(rows, now) {
  const rank = { you: 0, wait: 1, done: 2 };
  return rows
    .filter((r) => !(r.snooze > now) && !(r.move === "done" && r.closedAt && now - r.closedAt > GONE_AFTER))
    .sort((a, b) => (rank[a.move] ?? 1) - (rank[b.move] ?? 1) || (b.number ?? 0) - (a.number ?? 0));
}

// The next 8:00: today when it is still before 8.
export function tomorrow(now) {
  const d = new Date(now);
  if (d.getHours() >= 8) d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.getTime();
}

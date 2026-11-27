// Run: node mods/mh-spaces/watch.test.mjs
import assert from "node:assert";
import { GONE_AFTER, goneOf, moveOf, shownOf, tomorrow } from "./watch-data.js";

const ME = "holtetx";
const T = (h) => new Date(Date.UTC(2026, 10, 27, h)).toISOString();
const comment = (login, h, type = "User") => ({ k: "comments", createdAt: T(h), author: { login, __typename: type } });
const review = (login, h, state) => ({ k: "reviews", submittedAt: T(h), state, author: { login, __typename: "User" } });
const commit = (login, h) => ({ k: "lastCommit", commit: { committedDate: T(h), author: { user: { login, __typename: "User" } } } });
const list = (events, k) => ({ nodes: events.filter((e) => e.k === k) });
const pr = (author, events = [], x = {}) => ({ state: "OPEN", author: { login: author }, comments: list(events, "comments"), reviews: list(events, "reviews"), latestReviews: list(events, "reviews"), lastCommit: list(events, "lastCommit"), ...x });
const ci = (state) => ({ commits: { nodes: [{ commit: { statusCheckRollup: { state } } }] } });
const why = (n, seen) => moveOf(n, ME, seen).why;

// Theirs: a review request is your move; a new reply is too, until you look or answer.
assert.equal(why(pr("kristian", [], { reviewRequests: { nodes: [{ requestedReviewer: { login: ME } }] } })), "review asked");
assert.equal(why(pr("kristian", [review(ME, 9, "COMMENTED"), commit("kristian", 10)])), "new reply");
assert.equal(why(pr("kristian", [review(ME, 9, "COMMENTED"), commit("kristian", 10)]), Date.parse(T(11))), "their move");
assert.equal(why(pr("kristian", [comment("kristian", 10), comment(ME, 11)])), "their move");

// Bots never count: Sonar's quality gate and the Slack notice.
assert.equal(why(pr("kristian", [comment(ME, 9), comment("sonarqubecloud[bot]", 10), comment("github-actions", 11, "Bot")])), "their move");
assert.equal(why(pr(ME, [comment(ME, 9), comment("sonarqubecloud[bot]", 10, "Bot")])), "in review");

// Yours: CI failed, then changes asked (until you answer), then news, then approved.
assert.equal(why(pr(ME, [], ci("FAILURE"))), "CI failed");
assert.equal(why(pr(ME, [review("kristian", 10, "CHANGES_REQUESTED")], { reviewDecision: "CHANGES_REQUESTED" }), Date.parse(T(12))), "changes asked");
assert.equal(why(pr(ME, [review("kristian", 10, "CHANGES_REQUESTED"), commit(ME, 11)], { reviewDecision: "CHANGES_REQUESTED" })), "in review");
assert.equal(why(pr(ME, [comment("kristian", 10)])), "new reply");
assert.equal(why(pr(ME, [review("kristian", 10, "APPROVED")], { reviewDecision: "APPROVED", ...ci("SUCCESS") }), Date.parse(T(11))), "merge it");
assert.equal(why(pr(ME, [], { reviewDecision: "APPROVED", ...ci("PENDING") })), "in review");
assert.equal(why(pr(ME, [], { isDraft: true })), "draft");
assert.equal(moveOf(pr(ME, [], { state: "MERGED" }), ME).move, "done");
// In the merge queue: waiting, not MERGE IT. No required reviews: an approval still means merge it.
assert.equal(why(pr(ME, [], { reviewDecision: "APPROVED", isInMergeQueue: true })), "queued");
assert.equal(why(pr(ME, [review("kristian", 10, "APPROVED")], ci("SUCCESS")), Date.parse(T(11))), "merge it");
// A change request older than the newest 30 comments still counts (latestReviews).
assert.equal(why({ ...pr(ME, Array.from({ length: 30 }, (_, i) => comment("kristian", 11 + i / 60))), latestReviews: { nodes: [review("kristian", 10, "CHANGES_REQUESTED")] }, reviewDecision: "CHANGES_REQUESTED" }, Date.parse(T(13))), "changes asked");
// Done a day after closedAt.
assert.equal(goneOf({ state: "MERGED", closedAt: T(0) }, Date.parse(T(0)) + GONE_AFTER + 1), true);
assert.equal(goneOf({ state: "OPEN" }, Date.parse(T(12))), false);

// Shown: your move first, snoozed and long-merged ones left out.
const now = Date.parse(T(12));
const rows = [
  { url: "a", number: 1, move: "wait" },
  { url: "b", number: 2, move: "you" },
  { url: "c", number: 3, move: "you", snooze: now + 1 },
  { url: "d", number: 4, move: "done", closedAt: now - GONE_AFTER - 1 },
  { url: "e", number: 5, move: "done", closedAt: now - 1 },
];
assert.deepEqual(shownOf(rows, now).map((r) => r.url), ["b", "a", "e"]);

// Snooze ends at 8 the next morning.
const t = new Date(tomorrow(new Date(2026, 10, 27, 23, 30).getTime()));
assert.deepEqual([t.getDate(), t.getHours()], [28, 8]);
const early = new Date(tomorrow(new Date(2026, 10, 27, 1, 30).getTime()));
assert.deepEqual([early.getDate(), early.getHours()], [27, 8]);

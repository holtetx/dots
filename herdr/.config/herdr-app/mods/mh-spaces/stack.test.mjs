// Run: node mods/mh-spaces/stack.test.mjs
import assert from "node:assert";
import { foldStacks, offHead, stacked, worktreesOf } from "./stack.js";

const P = (n, branch, base, updated, x = {}) => ({ n, branch, base, updated, ...x });
const show = (l) => l.map((p) => `${p.n}:${p.depth}`).join(" ");

// A chain 1<-2<-3, a fan 5<-(6,7), a single 9 that is newest, and a fork 8 whose base name equals a head.
assert.equal(
  show(stacked([P(3, "c", "b", 1), P(1, "a", "main", 2), P(2, "b", "a", 3), P(9, "z", "main", 50), P(5, "e", "main", 4), P(6, "f", "e", 9), P(7, "g", "e", 8), P(8, "h", "a", 1, { fork: true })])),
  "9:0 5:0 6:1 7:1 1:0 2:1 3:2 8:0",
);
// Of two children of one parent, only the second is the last.
assert.deepEqual(stacked([P(5, "e", "main", 4), P(6, "f", "e", 9), P(7, "g", "e", 8)]).slice(1).map((p) => p.last), [false, true]);
// A review asked in a child lifts the whole stack.
assert.equal(show(stacked([P(1, "a", "main", 1), P(2, "b", "a", 1, { rr: true }), P(9, "z", "main", 50)])), "1:0 2:1 9:0");
// Two PRs based on each other: both shown, flat.
assert.equal(stacked([P(1, "a", "b", 1), P(2, "b", "a", 2)]).length, 2);
// A PR based on its own branch is a root.
assert.equal(show(stacked([P(1, "a", "a", 1)])), "1:0");
// Stacks fold under their root unless open; a search shows them all.
{
  const rows = stacked([P(1, "a", "main", 2, { url: "u1" }), P(2, "b", "a", 3, { url: "u2" }), P(3, "c", "b", 1, { url: "u3" }), P(9, "z", "main", 1, { url: "u9" })]);
  assert.equal(show(foldStacks(rows, new Set(), false)), "1:0 9:0");
  assert.equal(rows[0].kids.map((p) => p.n).join(), "2,3");
  assert.equal(rows[2].root, "u1");
  assert.equal(show(foldStacks(rows, new Set(["u1"]), false)), "1:0 2:1 3:2 9:0");
  assert.equal(show(foldStacks(rows, new Set(), true)), "1:0 2:1 3:2 9:0");
}
// Checkouts of a PR that are not at its newest commit: its branch, or a review-<number> folder.
const wts = worktreesOf("worktree /r\nHEAD aaa\nbranch refs/heads/feat\n\nworktree /r/.claude/worktrees/review-7\nHEAD bbb\ndetached\n\nworktree /r/.claude/worktrees/other\nHEAD ccc\nbranch refs/heads/other\n");
assert.deepEqual(wts[1], { path: "/r/.claude/worktrees/review-7", head: "bbb", branch: null });
assert.deepEqual(offHead({ number: 7, branch: "feat", oid: "new" }, wts).map((w) => w.head), ["aaa", "bbb"]);
assert.deepEqual(offHead({ number: 7, branch: "feat", oid: "aaa" }, wts).map((w) => w.head), ["bbb"]);
assert.deepEqual(offHead({ number: 8, branch: "feat", oid: "new", fork: true }, wts), []);
assert.deepEqual(offHead({ number: 9, branch: "none", oid: "new" }, wts), []);
console.log("ok");

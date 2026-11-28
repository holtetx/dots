// Run: node mods/mh-copy/fingers.test.mjs
import assert from "node:assert";
import { find, helpBox, hints, patterns } from "./fingers.mjs";

const pats = patterns(["url", "path", "sha", "github"]);
const lines = [
  "See https://github.com/owner/repo/pull/386, and (https://x.y/a).",
  "  modified: ~/dots/keys.json:12 at 5f0a3c7d for #42",
  "deadbeefcafe and 1234567 are not hashes to hint",
];
const got = find(lines, pats).map((m) => [m.kind, m.text]);
assert.deepStrictEqual(got, [
  ["url", "https://github.com/owner/repo/pull/386"],
  ["url", "https://x.y/a"],
  ["path", "~/dots/keys.json:12"],
  ["sha", "5f0a3c7d"],
  ["github", "#42"],
]);
// A url match is not also a path, and a hash needs a digit and a letter.
assert.ok(!got.some(([k, t]) => k === "path" && t.includes("github.com")));

// Skill commands keep their issue number, beat path and github, and aren't found inside paths.
const skills = find(
  ["run /mattpocock-skills:to-tickets 227 now", "/mattpocock-skills:implement #198", "/mattpocock-skills:retro of x", "~/dots/keys.json:12"],
  patterns(["skill", "path", "github"]),
).map((m) => [m.kind, m.text]);
assert.deepStrictEqual(skills, [
  ["skill", "/mattpocock-skills:to-tickets 227"],
  ["skill", "/mattpocock-skills:implement #198"],
  ["skill", "/mattpocock-skills:retro"],
  ["path", "~/dots/keys.json:12"],
]);

// The same text gets one label; the lowest line is labelled first.
const labels = hints([{ row: 0, start: 0, text: "a" }, { row: 2, start: 0, text: "b" }, { row: 1, start: 0, text: "a" }]);
assert.deepStrictEqual([...labels], [["b", "s"], ["a", "d"]]);
// More texts than letters: two-letter labels, all different.
const many = hints(Array.from({ length: 40 }, (_, i) => ({ row: 0, start: i, text: `t${i}` })));
assert.strictEqual(new Set(many.values()).size, 40);

// The ? panel is a closed box: every line as wide as its frame.
const box = helpBox().map((l) => [...l.replace(/\x1b\[[0-9;]*m/g, "")].length);
assert.ok(box.every((n) => n === box[0]));
console.log("ok");

// Run: node mods/mh-spaces/remote.test.mjs
import assert from "node:assert";
import { githubRepo } from "./remote.js";

assert.strictEqual(githubRepo("git@github.com:owner/repo.git\n"), "owner/repo");
assert.strictEqual(githubRepo("https://github.com/owner/repo"), "owner/repo");
assert.strictEqual(githubRepo("https://github.com/owner/repo.git/"), "owner/repo");
assert.strictEqual(githubRepo("git@personalgit:owner/my.repo.git"), "owner/my.repo");
assert.strictEqual(githubRepo("ssh://git@github.com/owner/repo.git"), "owner/repo");
assert.strictEqual(githubRepo("https://gitlab.com/owner/repo"), null);
assert.strictEqual(githubRepo(null), null);
console.log("ok");

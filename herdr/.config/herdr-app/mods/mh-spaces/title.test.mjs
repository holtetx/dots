// Run: node mods/mh-spaces/title.test.mjs
import assert from "node:assert";
import { telling } from "./title.js";

const A = (title) => ({ title, address: "t1", program: { name: "Claude Code", key: "claude" } });

assert.equal(telling(A("✳ /review-all with entur-kompass")), "review-all with entur-kompass");
assert.equal(telling(A("Jira board task status")), "Jira board task status");
assert.equal(telling(A("~/d/e/a/automat-app")), null);
assert.equal(telling(A("/Users/me/dots")), null);
assert.equal(telling(A("C:\\Users\\me")), null);
assert.equal(telling(A("me@host")), null);

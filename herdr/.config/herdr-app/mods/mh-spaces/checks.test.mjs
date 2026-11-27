// Run: node mods/mh-spaces/checks.test.mjs
import assert from "node:assert";
import { checksOf, countLine, took } from "./checks-data.js";

const run = (name, workflow, status, conclusion, startedAt, completedAt = null) =>
  ({ __typename: "CheckRun", name, status, conclusion, detailsUrl: `u/${name}/${startedAt}`, startedAt, completedAt, checkSuite: { workflowRun: { workflow: { name: workflow } } } });
const pr = (nodes) => ({ commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes } } } }] } });

const list = checksOf(pr([
  run("test", "CI", "COMPLETED", "FAILURE", "2026-01-01T10:00:00Z", "2026-01-01T10:01:00Z"),
  // A re-run of the same check: only the newest counts.
  run("test", "CI", "IN_PROGRESS", null, "2026-01-01T11:00:00Z"),
  run("build", "CI", "COMPLETED", "SUCCESS", "2026-01-01T10:00:00Z", "2026-01-01T10:02:05Z"),
  // The same name in another workflow is another check.
  run("test", "Nightly", "COMPLETED", "TIMED_OUT", "2026-01-01T09:00:00Z", "2026-01-01T09:30:00Z"),
  run("docs", "CI", "COMPLETED", "SKIPPED", "2026-01-01T10:00:00Z", "2026-01-01T10:00:01Z"),
  { __typename: "StatusContext", context: "sonar", state: "PENDING", targetUrl: "u/sonar", createdAt: "2026-01-01T10:00:00Z" },
]));
assert.deepEqual(list.map((c) => `${c.workflow}/${c.name}:${c.state}`), ["Nightly/test:failed", "/sonar:running", "CI/test:running", "CI/build:passed", "CI/docs:skipped"]);
assert.equal(list.find((c) => c.name === "build").ended - list.find((c) => c.name === "build").started, 125000);
assert.equal(countLine(list), "1 failed, 2 running, 1 passed, 1 skipped");
assert.equal(countLine([]), "");
assert.deepEqual(checksOf({}), []);
assert.deepEqual([took(42000), took(125000), took(3720000)], ["42s", "2m 5s", "1h 2m"]);
console.log("ok");

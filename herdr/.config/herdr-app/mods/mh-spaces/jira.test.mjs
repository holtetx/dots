// Run: node mods/mh-spaces/jira.test.mjs
import assert from "node:assert";
import { byColumn, columnsOf, issueOf, validBoard, validSite } from "./jira.js";

const config = { columnConfig: { columns: [
  { name: "Backlog", statuses: [{ id: "1" }] },
  { name: "Backlog", statuses: [{ id: "10007" }] },
  { name: "Analyse", statuses: [{ id: "10711" }, { id: "11683" }] },
  { name: "Ferdig", statuses: [{ id: "10710" }] },
] } };
const cols = columnsOf(config);
assert.deepStrictEqual(cols.map((c) => c.name), ["Backlog", "Analyse", "Ferdig"]);
assert.ok(cols[0].statuses.has("1") && cols[0].statuses.has("10007"));

const n = (key, id) => ({ key, fields: { summary: key, status: { id, name: "x", statusCategory: { key: "new" } }, updated: "2026-11-20T10:00:00.000+0100" } });
const issues = [n("ABC-3", "11683"), n("ABC-1", "10007"), n("ABC-9", "999"), n("ABC-2", "10711")].map((i) => issueOf(i, "x.atlassian.net", 0));
assert.strictEqual(issues[0].url, "https://x.atlassian.net/browse/ABC-3");
const secs = byColumn(cols, issues);
assert.deepStrictEqual(secs.map((s) => [s.name, s.items.map((i) => i.key)]), [["Backlog", ["ABC-1"]], ["Analyse", ["ABC-3", "ABC-2"]]]);

assert.ok(validSite("example.atlassian.net") && !validSite("evil.com/x?") && !validSite("a.atlassian.net.evil.com"));
assert.ok(validBoard("282") && !validBoard("282/../1") && !validBoard(""));
console.log("ok");

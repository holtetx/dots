// Run: node mods/mh-spaces/jira.test.mjs
import assert from "node:assert";
import { adfBlocks, adfToMd, avatarOf, blockersOf, byColumn, columnsOf, foldKey, initials, issueOf, linksOf, textToAdf, validBoard, validKey, validProject, validSite } from "./jira.js";

const config = { columnConfig: { columns: [
  { name: "Backlog", statuses: [{ id: "1" }] },
  { name: "Backlog", statuses: [{ id: "10007" }] },
  { name: "Review", statuses: [{ id: "3" }, { id: "4" }], max: 8 },
  { name: "Done", statuses: [{ id: "5" }] },
] } };
const cols = columnsOf(config);
assert.deepStrictEqual(cols.map((c) => c.name), ["Backlog", "Review", "Done"]);
assert.ok(cols[0].statuses.has("1") && cols[0].statuses.has("10007"));

const n = (key, id) => ({ key, fields: { summary: key, status: { id, name: "x", statusCategory: { key: "new" } }, updated: "2026-11-20T10:00:00.000+0100" } });
const issues = [n("ABC-3", "4"), n("ABC-1", "10007"), n("ABC-9", "999"), n("ABC-2", "3")].map((i) => issueOf(i, "x.atlassian.net"));
assert.strictEqual(issues[0].url, "https://x.atlassian.net/browse/ABC-3");
const secs = byColumn(cols, issues);
assert.deepStrictEqual(secs.map((s) => [s.name, s.max, s.items.map((i) => i.key)]), [["Backlog", null, ["ABC-1"]], ["Review", 8, ["ABC-3", "ABC-2"]], ["Done", null, []]]);
assert.deepStrictEqual(issueOf({ key: "A-1", fields: { parent: { key: "A-9", fields: { summary: "Epic" } } } }, "x.atlassian.net").parent, { key: "A-9", title: "Epic" });

const p = (...content) => ({ type: "paragraph", content });
const tx = (text, ...marks) => ({ type: "text", text, marks: marks.map((type) => (typeof type === "string" ? { type } : type)) });
const doc = { type: "doc", content: [
  { type: "heading", attrs: { level: 2 }, content: [tx("Mål")] },
  p(tx("Se "), tx("her", { type: "link", attrs: { href: "https://x.y" } }), tx(" og "), tx("kode", "code"), { type: "hardBreak" }, tx("bold", "strong")),
  { type: "bulletList", content: [
    { type: "listItem", content: [p(tx("en")), { type: "bulletList", content: [{ type: "listItem", content: [p(tx("under"))] }] }] },
    { type: "listItem", content: [p(tx("to"))] },
  ] },
  { type: "orderedList", attrs: { order: 3 }, content: [{ type: "listItem", content: [p(tx("tre"))] }] },
  { type: "codeBlock", attrs: { language: "sh" }, content: [tx("ls -la")] },
  { type: "mediaSingle", content: [{ type: "media", attrs: { id: "1" } }] },
  { type: "table", content: [
    { type: "tableRow", content: [{ type: "tableHeader", content: [p(tx("a"))] }, { type: "tableHeader", content: [p(tx("b|c"))] }] },
    { type: "tableRow", content: [{ type: "tableCell", content: [p(tx("1"))] }, { type: "tableCell", content: [p(tx("2"))] }] },
  ] },
  p({ type: "mention", attrs: { text: "@Kari" } }, tx(" ok")),
] };
assert.strictEqual(adfToMd(doc, "https://x.atlassian.net/browse/A-1"), [
  "## Mål",
  "Se [her](https://x.y) og `kode`  \n**bold**",
  "- en\n  - under\n- to",
  "3. tre",
  "```sh\nls -la\n```",
  "[Attachment: opens in Jira](https://x.atlassian.net/browse/A-1)",
  "| a | b\\|c |\n| --- | --- |\n| 1 | 2 |",
  "@Kari ok",
].join("\n\n"));
assert.strictEqual(adfToMd(null, ""), "");
assert.strictEqual(adfToMd({ type: "doc", content: [p(tx("Ønsker jeg ", "strong"), tx("x"), tx("  ", "em"))] }, ""), "**Ønsker jeg** x  ");
assert.strictEqual(foldKey(" DONE "), foldKey("Done"));
assert.deepStrictEqual([initials("Åse Kari Nordmann"), initials("Kari"), initials(" ")], ["ÅN", "K", "?"]);
assert.ok(validKey("ABC-123") && !validKey("ABC-1/../x") && !validKey("abc-1"));

assert.ok(validSite("example.atlassian.net") && !validSite("evil.com/x?") && !validSite("a.atlassian.net.evil.com"));
assert.ok(validBoard("12") && !validBoard("12/../1") && !validBoard(""));
const blocks = { name: "Blocks", inward: "is blocked by", outward: "blocks" };
const other = (key, cat) => ({ key, fields: { summary: key, status: { name: "s", statusCategory: { key: cat } }, issuetype: { name: "Task" } } });
const links = linksOf({ issuelinks: [
  { type: blocks, inwardIssue: other("A-1", "new") },
  { type: blocks, inwardIssue: other("A-2", "done") },
  { type: blocks, outwardIssue: other("A-3", "new") },
  { type: { name: "Relates", inward: "relates to", outward: "relates to" }, outwardIssue: other("A-4", "indeterminate") },
  { type: blocks },
] }, "x.atlassian.net");
assert.deepStrictEqual(links.map((l) => [l.why, l.key, l.blocker]), [["is blocked by", "A-1", true], ["is blocked by", "A-2", true], ["blocks", "A-3", false], ["relates to", "A-4", false]]);
assert.strictEqual(links[0].url, "https://x.atlassian.net/browse/A-1");
assert.deepStrictEqual(blockersOf(links), ["A-1"]);
assert.deepStrictEqual(issueOf({ key: "A-9", fields: {} }, "x.atlassian.net").blockedBy, []);
assert.strictEqual(avatarOf({ avatarUrls: { "48x48": "https://secure.gravatar.com/avatar/abc?d=x" } }), "https://secure.gravatar.com/avatar/abc?d=x");
assert.ok(avatarOf({ avatarUrls: { "48x48": "https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/123/a.png" } }));
assert.strictEqual(avatarOf({ avatarUrls: { "48x48": "https://x.atlassian.net/secure/useravatar?id=1" } }), null);
assert.strictEqual(avatarOf({ avatarUrls: { "48x48": "https://secure.gravatar.com.evil.com/x" } }), null);
assert.strictEqual(avatarOf(null), null);
assert.deepStrictEqual(adfBlocks({ type: "doc", content: [
  { type: "heading", attrs: { level: 2 }, content: [tx("A")] }, p(tx("one")), p(tx("two")), p(), { type: "heading", attrs: { level: 2 }, content: [tx("B")] },
] }, ""), ["## A\n\none", "two", "## B"]);
assert.deepStrictEqual(adfBlocks(null, ""), []);
console.log("ok");

const para = (...content) => ({ type: "paragraph", content });
assert.deepStrictEqual(textToAdf("  one\ntwo\n\n \nthree\n"), { type: "doc", version: 1, content: [
  para({ type: "text", text: "one" }, { type: "hardBreak" }, { type: "text", text: "two" }),
  para({ type: "text", text: "three" }),
] });
assert.deepStrictEqual(textToAdf("a\n\nb").content.length, 2);
assert.ok(validProject("ETU") && validProject("A1_B") && !validProject("etu") && !validProject("ETU-1") && !validProject(undefined));
assert.deepStrictEqual(secs[1].statuses, ["3", "4"]);

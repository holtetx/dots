// Run: node mods/mh-tabs/usage-data.test.mjs
import assert from "node:assert";
import { changes, logFiles, nextTip, parseLog, snapshot } from "./usage-data.js";
import { featureOf, summarize } from "./usage-report.mjs";

const T = (id, x = {}) => ({ id, named: false, name: "1", panes: 1, zoomed: false, settled: false, ...x });
const S = (id, tabs, x = {}) => ({ id, named: false, name: "dots", tabs, ...x });
const snap = (spaces, focus = { space: "s1", tab: "a", pane: "p1" }, layout = "mh") => snapshot(spaces, focus, layout);
const base = [S("s1", [T("a"), T("b")])];

// Split, zoom, rename and a new tab in one tick; the focus move to the new tab is not counted.
assert.deepEqual(
  changes(snap(base), snap([S("s1", [T("a", { panes: 3, zoomed: true }), T("b", { named: true, name: "api" }), T("c")])], { space: "s1", tab: "c", pane: "p9" })),
  ["tab.new", "pane.split", "pane.split", "pane.zoom", "tab.rename"],
);
// A tab moved, and one closed: only the closed one changes the kept order of the others.
assert.deepEqual(changes(snap(base), snap([S("s1", [T("b"), T("a")])])), ["tab.move"]);
assert.deepEqual(changes(snap([S("s1", [T("a"), T("b"), T("c")])]), snap([S("s1", [T("a"), T("c")])])), ["tab.close"]);
// Focus moves when nothing else changed.
assert.deepEqual(changes(snap(base), snap(base, { space: "s1", tab: "b", pane: "p2" })), ["tab.select"]);
assert.deepEqual(changes(snap(base), snap(base, { space: "s1", tab: "a", pane: "p2" })), ["pane.go"]);
assert.deepEqual(changes(snap(base), snap(base, {}, "other")), ["layout.switch"]);
assert.deepEqual(changes(snapshot(base, {}, "mh", true), snapshot(base, {}, "mh", false)), ["layout.toggle:sidebar"]);
// A new space, a renamed space; and a burst of spaces (the app starting, a machine connecting) is not counted.
assert.deepEqual(changes(snap(base), snap([...base, S("s2", [T("x")])], { space: "s2", tab: "x" })), ["space.new"]);
assert.deepEqual(changes(snap(base), snap([S("s1", base[0].tabs, { named: true, name: "work" })])), ["space.rename"]);
assert.deepEqual(changes(snap(base), snap([...base, S("s2", []), S("s3", []), S("s4", [])])), []);

const now = Date.parse("2026-11-27T12:00:00Z");
const tips = [{ f: "mh-spaces.board" }, { f: "mh-tabs.fingers" }, { f: "pane.zoom" }];
const log = parseLog([
  '{"t":"2026-11-25T10:00:00Z","f":"mh-spaces.board.n","via":"key"}',
  "not json",
  '{"t":"2026-09-01T10:00:00Z","f":"mh-tabs.fingers","via":"key"}',
  '{"t":"2026-11-26T10:00:00Z","f":"pane.zoom","via":"tip"}',
].join("\n"));
assert.equal(log.length, 3);
// The board was used (a key inside it counts), fingers only long ago; a tip is not a use.
assert.equal(nextTip(tips, log, {}, now).f, "mh-tabs.fingers");
assert.equal(nextTip(tips, log, { "mh-tabs.fingers": "2026-11-24" }, now).f, "pane.zoom");
assert.equal(nextTip(tips, log, { "mh-tabs.fingers": "2026-11-19", "pane.zoom": "2026-11-27" }, now).f, "mh-tabs.fingers");
assert.equal(nextTip([{ f: "mh-spaces.board" }], log, {}, now), null);

assert.deepEqual(logFiles(Date.parse("2026-01-15T00:00:00Z")), ["2025-12.jsonl", "2026-01.jsonl"]);

// The report: keys map to features, a use inside a dialog covers it, quick escapes and tips.
assert.equal(featureOf("mod.open:mh-picker"), "mh-picker");
assert.equal(featureOf("pane.split:right"), "pane.split");
assert.equal(featureOf({ command: "tab.move", args: { by: 1 } }), "tab.move");
assert.equal(featureOf("layout.toggle:sidebar"), "layout.toggle:sidebar");
assert.equal(featureOf("terminal.copy"), null);
assert.equal(featureOf("send:\u0001"), null);
const keys = { global: { "cmd-p": "mod.open:mh-picker", "cmd-k": "mod.open:mh-sessions", "cmd-c": "terminal.copy" } };
const L = (s, f, via, src = "mh") => ({ t: `2026-11-27T10:00:${s}Z`, src, f, via });
const s = summarize([
  L("00", "mh-picker.open", "open"), L("02", "mh-picker.escape", "key"),
  L("10", "mh-picker.open", "open"), L("20", "mh-picker.enter", "key"),
  L("30", "pane.zoom", "tip", "herdr"), L("40", "pane.zoom", "state", "herdr"),
], keys, [{ f: "pane.zoom" }], now);
assert.deepEqual(s.never, ["mh-sessions"]);
assert.deepEqual(s.unlogged, ["cmd-c: terminal.copy"]);
assert.deepEqual(s.quick["mh-picker"], { opens: 2, esc: 1 });
assert.deepEqual(s.tipped.map((x) => x.used), [true]);
assert.equal(s.rows[0].f, "mh-picker.open");
console.log("ok");

// Run: node mods/mh-tabs/usage-data.test.mjs
import assert from "node:assert";
import { changes, featureOf, logFiles, nextTip, parseLog, snapshot, summarize } from "./usage-data.js";

const T = (id, x = {}) => ({ id, named: false, name: "1", panes: 1, zoomed: false, settled: false, ...x });
const S = (id, tabs, x = {}) => ({ id, named: false, name: "dots", machine: null, tabs, ...x });
const snap = (spaces, layout = "mh", sidebar = true) => snapshot(spaces, layout, sidebar);
const base = [S("s1", [T("a"), T("b")])];

// Split, zoom, rename and a new tab in one tick.
assert.deepEqual(
  changes(snap(base), snap([S("s1", [T("a", { panes: 3, zoomed: true }), T("b", { named: true, name: "api" }), T("c")])])),
  ["tab.new", "pane.split", "pane.split", "pane.zoom", "tab.rename"],
);
// A tab moved, and one closed: only the closed one changes the kept order of the others.
assert.deepEqual(changes(snap(base), snap([S("s1", [T("b"), T("a")])])), ["tab.move"]);
assert.deepEqual(changes(snap([S("s1", [T("a"), T("b"), T("c")])]), snap([S("s1", [T("a"), T("c")])])), ["tab.close"]);
assert.deepEqual(changes(snap(base), snap(base, "other")), ["layout.switch"]);
assert.deepEqual(changes(snap(base), snap(base, "mh", false)), ["layout.toggle:sidebar"]);
// A new space, a renamed space; a burst of spaces (the app starting) and a remote machine (dis)connecting are not counted.
assert.deepEqual(changes(snap(base), snap([...base, S("s2", [T("x")])])), ["space.new"]);
assert.deepEqual(changes(snap(base), snap([S("s1", base[0].tabs, { named: true, name: "work" })])), ["space.rename"]);
assert.deepEqual(changes(snap(base), snap([...base, S("s2", []), S("s3", []), S("s4", [])])), []);
const remote = S("vps/s9", [T("r")], { machine: "vps" });
assert.deepEqual(changes(snap(base), snap([...base, remote])), []);
assert.deepEqual(changes(snap([...base, remote]), snap(base)), []);

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

assert.deepEqual(logFiles(Date.parse("2026-03-02T00:00:00Z")).slice(0, 3), ["2026-03-02.jsonl", "2026-03-01.jsonl", "2026-02-28.jsonl"]);
assert.equal(logFiles(now).length, 8);

// The report: keys map to features, a use inside a dialog covers it, quick escapes and tips.
assert.equal(featureOf("mod.open:mh-picker"), "mh-picker");
assert.equal(featureOf("pane.split:right"), "pane.split");
assert.equal(featureOf({ command: "tab.move", args: { by: 1 } }), "tab.move");
assert.equal(featureOf('{"command":"tab.move","args":{"by":1}}'), "tab.move");
assert.equal(featureOf("layout.toggle:sidebar"), "layout.toggle:sidebar");
assert.equal(featureOf("tab.select:1"), null);
assert.equal(featureOf("terminal.copy"), null);
assert.equal(featureOf("send:\u0001"), null);
const keys = { global: { "cmd-p": "mod.open:mh-picker", "cmd-k": "mod.open:mh-sessions", "cmd-c": "terminal.copy" } };
const L = (s, f, via) => ({ t: `2026-11-27T10:00:${s}Z`, f, via });
const s = summarize([
  L("00", "mh-picker.open", "open"), L("02", "mh-picker.escape", "key"),
  L("10", "mh-picker.open", "open"), L("20", "mh-picker.enter", "key"),
  // The board opens as mh-spaces.board; its esc is logged under the shown tab.
  L("25", "mh-spaces.board", "open"), L("26", "mh-spaces.board.prs.escape", "key"),
  L("30", "pane.zoom", "tip"), L("40", "pane.zoom", "state"),
], keys, [{ f: "pane.zoom" }], now);
assert.deepEqual(s.never, ["mh-sessions"]);
assert.deepEqual(s.unlogged, ["cmd-c: terminal.copy"]);
assert.deepEqual(s.quick["mh-picker"], { opens: 2, esc: 1 });
assert.deepEqual(s.quick["mh-spaces.board"], { opens: 1, esc: 1 });
assert.deepEqual(s.tipped.map((x) => x.used), [true]);
assert.deepEqual(s.rows.map((r) => [r.f, r.src]).slice(0, 1), [["mh-picker.open", "mh"]]);
assert.equal(s.rows.find((r) => r.f === "pane.zoom").src, "herdr");
console.log("ok");

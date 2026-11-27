// Run: node mods/mh-spaces/history.test.mjs
// history.mjs runs as a script (mh-spaces passes it to node -e), so it runs here on a made-up HOME.
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "history-test-"));
try {
  const dir = join(home, ".claude", "projects", "-p");
  mkdirSync(dir, { recursive: true });
  const pr = (n) => `https://github.com/o/r/pull/${n}`;
  const lines = [
    { type: "user", cwd: "/p", message: { content: `Review ${pr(1)} please` } },
    { type: "user", isMeta: true, message: { content: pr(2) } },
    { type: "user", isSidechain: true, message: { content: pr(3) } },
    { type: "user", message: { content: [{ type: "text", text: `<system-reminder>${pr(4)}</system-reminder>` }] } },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", input: { command: "gh pr create --fill" } }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: `${pr(5)}\n${pr(6)}` }] } },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "t2", input: { command: `node herdr-link.mjs https://www.github.com/o/r/issues/7` } }] } },
    { type: "assistant", message: { content: [{ type: "text", text: `Only said: ${pr(8)}` }] } },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "t3", input: { command: `grep -n "herdr-link.mjs" history.test.mjs # ${pr(10)}` } }] } },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "t4", input: { command: `u=${pr(11)}; node herdr-link.mjs "$u"` } }] } },
    { type: "pr-link", prUrl: pr(9) },
    { type: "ai-title", aiTitle: "A title" },
  ];
  writeFileSync(join(dir, "s1.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n"));
  writeFileSync(join(dir, "s2.jsonl"), JSON.stringify({ type: "user", message: { content: "no links" } }));
  const env = { ...process.env, HOME: home, XDG_CACHE_HOME: join(home, ".cache") };
  const out = JSON.parse(execFileSync(process.execPath, [new URL("./history.mjs", import.meta.url).pathname], { env, encoding: "utf8" }));
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].cwd, "/p");
  assert.strictEqual(out[0].title, "A title");
  assert.deepStrictEqual([...out[0].links].sort(), [pr(1), pr(5), "https://github.com/o/r/issues/7", pr(9), pr(11)].sort());
} finally {
  rmSync(home, { recursive: true, force: true });
}
console.log("ok");

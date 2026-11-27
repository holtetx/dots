// The usage report for /herdr-usage, the last 7 days. Run: node mods/mh-tabs/usage-report.mjs
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseLog, summarize } from "./usage-data.js";

const table = (head, rows) => [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

function render(s, churn) {
  const day = (t) => t.slice(0, 10);
  const via = (v) => Object.entries(v).map(([k, n]) => `${k} ${n}`).join(", ");
  const part = (src) => table(["feature", "uses", "last", "via"], s.rows.filter((r) => r.src === src).map((r) => [r.f, r.n, day(r.last), via(r.via)]));
  return [
    `# Herdr usage since ${s.from}: ${s.events} uses`,
    "## Mine (mh-*)", part("mh"),
    "## Herdr's own (from state changes)", part("herdr"),
    "## Never used (a key or a tip, 0 uses)", s.never.map((f) => `- ${f}`).join("\n") || "none",
    "## Not logged (Herdr keys no mod sees, and focus moves)", s.unlogged.map((f) => `- ${f}`).join("\n"),
    "## Dialogs closed with esc within 5 s", table(["dialog", "opens", "quick esc"], Object.entries(s.quick).map(([a, q]) => [a, q.opens, q.esc])),
    "## Tips", s.tipped.length ? table(["tip", "shown", "used since"], s.tipped.map((x) => [x.f, day(x.shown), x.used ? "yes" : "no"])) : "none shown",
    "## Commits per mod, 90 days", table(["mod", "commits"], Object.entries(churn).sort((a, b) => b[1] - a[1])),
  ].join("\n\n");
}

function churnOf(mods) {
  try {
    const out = execFileSync("git", ["log", "--since=90.days", "--name-only", "--format=format:@", "--", "."], { cwd: mods, encoding: "utf8" });
    const per = {};
    for (const commit of out.split("@").slice(1)) {
      for (const mod of new Set([...commit.matchAll(/mods\/(mh-[^/]+)\//g)].map((m) => m[1]))) per[mod] = (per[mod] ?? 0) + 1;
    }
    return per;
  } catch {
    return {};
  }
}

const app = join(homedir(), ".config/herdr-app");
const dir = join(app, "mh-stats");
let text = "";
try { text = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => readFileSync(join(dir, f), "utf8")).join("\n"); } catch {}
const keys = JSON.parse(readFileSync(join(app, "keys.json"), "utf8"));
const tips = JSON.parse(readFileSync(new URL("./tips.json", import.meta.url), "utf8"));
console.log(render(summarize(parseLog(text), keys, tips, Date.now()), churnOf(realpathSync(join(app, "mods")))));

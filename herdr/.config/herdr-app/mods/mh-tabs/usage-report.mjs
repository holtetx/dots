// The usage report for /herdr-usage, the last 7 days. Run: node mods/mh-tabs/usage-report.mjs
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STATE, WINDOW, covers, parseLog } from "./usage-data.js";

const QUICK = 5000; // an esc this soon after a dialog opens, with nothing between: opened by mistake, or not what was wanted

// keys.json binding -> the feature id its use is logged as, or null when no mod sees it.
export function featureOf(action) {
  const a = typeof action === "string" ? action : action.command;
  if (a.startsWith("send:") || a === "terminal") return null;
  if (a.startsWith("mod.open:")) return a.slice(9);
  if (a.startsWith("mh-")) return a;
  if (STATE.includes(a)) return a;
  const name = a.split(":")[0];
  return STATE.includes(name) ? name : null;
}

export function summarize(log, keys, tips, now) {
  const since = now - WINDOW;
  const recent = log.filter((l) => Date.parse(l.t) >= since).sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const uses = recent.filter((l) => l.via !== "tip");
  const by = new Map();
  for (const l of uses) {
    const x = by.get(l.f) ?? { f: l.f, src: l.src, n: 0, last: l.t, via: {} };
    x.n++;
    x.last = l.t;
    x.via[l.via] = (x.via[l.via] ?? 0) + 1;
    by.set(l.f, x);
  }
  const rows = [...by.values()].sort((a, b) => b.n - a.n);
  const bindings = Object.values(keys).flatMap((section) => Object.entries(section));
  const ids = new Set([...bindings.map(([, a]) => featureOf(a)).filter(Boolean), ...tips.map((x) => x.f)]);
  const never = [...ids].filter((id) => !uses.some((l) => covers(id, l.f))).sort();
  const unlogged = bindings.filter(([, a]) => featureOf(a) === null).map(([k, a]) => `${k}: ${typeof a === "string" ? a : JSON.stringify(a)}`);
  const quick = {};
  recent.forEach((l, i) => {
    if (l.via !== "open") return;
    const area = l.f.replace(/\.open$/, "");
    const q = (quick[area] ??= { opens: 0, esc: 0 });
    q.opens++;
    const next = recent[i + 1];
    if (next && next.f === `${area}.escape` && Date.parse(next.t) - Date.parse(l.t) < QUICK) q.esc++;
  });
  const tipped = recent.filter((l) => l.via === "tip").map((l) => ({ f: l.f, shown: l.t, used: uses.some((u) => covers(l.f, u.f) && u.t > l.t) }));
  return { from: new Date(since).toISOString().slice(0, 10), events: uses.length, rows, never, unlogged, quick, tipped };
}

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
    "## Not logged (Herdr keys no mod sees)", s.unlogged.map((f) => `- ${f}`).join("\n"),
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

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const app = join(homedir(), ".config/herdr-app");
  const dir = join(app, "mh-stats");
  let text = "";
  try { text = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => readFileSync(join(dir, f), "utf8")).join("\n"); } catch {}
  const keys = JSON.parse(readFileSync(join(app, "keys.json"), "utf8"));
  const tips = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "tips.json"), "utf8"));
  console.log(render(summarize(parseLog(text), keys, tips, Date.now()), churnOf(realpathSync(join(app, "mods")))));
}

// A PR's CI checks. No Herdr imports, so checks.test.mjs can load it.

export const CHECKS = `commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { nodes { __typename
  ... on CheckRun { name status conclusion detailsUrl startedAt completedAt checkSuite { workflowRun { workflow { name } } } }
  ... on StatusContext { context state targetUrl createdAt } } } } } } }`;

const RUN = { SUCCESS: "passed", NEUTRAL: "skipped", SKIPPED: "skipped", STALE: "skipped" };
const STATUS = { SUCCESS: "passed", PENDING: "running", EXPECTED: "running" };
export const CHECK_STATES = ["failed", "running", "passed", "skipped"];

// The newest run of each check (the rollup keeps re-runs), worst first:
// [{ name, workflow, url, state, started, ended }], times in ms or null.
export function checksOf(n) {
  const list = n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes ?? [];
  const newest = {};
  for (const c of list) {
    const run = c.__typename === "CheckRun";
    const started = Date.parse(run ? c.startedAt : c.createdAt) || null;
    const it = run
      ? { name: c.name, workflow: c.checkSuite?.workflowRun?.workflow?.name ?? "", url: c.detailsUrl, state: c.status !== "COMPLETED" ? "running" : RUN[c.conclusion] ?? "failed", started, ended: Date.parse(c.completedAt) || null }
      : { name: c.context, workflow: "", url: c.targetUrl, state: STATUS[c.state] ?? "failed", started, ended: null };
    const key = `${run ? it.workflow : "status"}/${it.name}`;
    if (!newest[key] || (it.started ?? Infinity) >= (newest[key].started ?? Infinity)) newest[key] = it;
  }
  return Object.values(newest)
    .sort((a, b) => CHECK_STATES.indexOf(a.state) - CHECK_STATES.indexOf(b.state) || a.name.localeCompare(b.name));
}

// "1 failed, 2 running, 12 passed", or "" with no checks.
export const countLine = (checks, sep = ", ") => CHECK_STATES.map((s) => [s, checks.filter((c) => c.state === s).length]).filter(([, n]) => n).map(([s, n]) => `${n} ${s}`).join(sep);

export const worst = (checks) => CHECK_STATES.find((s) => checks.some((c) => c.state === s)) ?? null;

// GitHub's statusCheckRollup.state as a check state, or null.
const ROLLUP = { SUCCESS: "passed", FAILURE: "failed", ERROR: "failed", PENDING: "running", EXPECTED: "running" };
export const rollupState = (state) => ROLLUP[state] ?? null;

// The checks by workflow: [{ name, state, checks }], the worst first. Status contexts have no workflow: Other, last of its state.
export function groupsOf(checks) {
  const by = new Map();
  for (const c of checks) by.set(c.workflow || "Other", [...(by.get(c.workflow || "Other") ?? []), c]);
  return [...by].map(([name, list]) => ({ name, state: worst(list), checks: list }))
    .sort((a, b) => CHECK_STATES.indexOf(a.state) - CHECK_STATES.indexOf(b.state) || Number(a.name === "Other") - Number(b.name === "Other") || a.name.localeCompare(b.name));
}

// "Code Scan / codeql-analysis" -> ["Code Scan / ", "codeql-analysis"]: a reusable workflow's caller job, then its own.
export function splitName(name) {
  const i = name.lastIndexOf(" / ");
  return i < 0 ? ["", name] : [name.slice(0, i + 3), name.slice(i + 3)];
}

// 42s, 3m 5s, 1h 2m.
export function took(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export const fixPrompt = (check, prUrl) =>
  `The CI check "${[check.workflow, check.name].filter(Boolean).join(" / ")}" failed on ${prUrl} (${check.url}). Read its log, find the cause and fix it.`;

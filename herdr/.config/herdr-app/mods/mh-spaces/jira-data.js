// The Jira tab's data: one board, read only. Settings: shared("mh-jira") from mh-state.json,
// { account, vault, item }: the 1Password item with the fields email, site, board and
// credential (an API token). The work Mac only: without it the board has no Jira tab.
// The item is read once per Herdr run (one op call, so one approval) and kept in memory
// only; copies of mh-spaces share it. Only GET, and only the two board paths below.

import { exec, shared } from "herdr";
import { byColumn, columnsOf, issueOf, validBoard, validSite } from "./jira.js";

export const jiraSettings = () => {
  const s = shared("mh-jira");
  return s?.account && s?.vault && s?.item ? s : null;
};

let auth = null; // { refs, site, board, header }

async function credentials(cfg) {
  const refs = JSON.stringify([cfg.account, cfg.vault, cfg.item]);
  if (auth?.refs === refs) return auth;
  // --account: without it, op outside a terminal asks once per signed-in account.
  // </dev/null: op reads stdin when it isn't a terminal, and exec's stdin never closes.
  const r = await exec("sh", ["-c", 'exec op item get "$1" --account "$2" --vault "$3" --fields label=email,label=site,label=board,label=credential --reveal --format json </dev/null', "sh", cfg.item, cfg.account, cfg.vault], { timeout: 60000 })
    .catch((e) => { throw new Error(`Couldn't run op: ${e?.message ?? e}`); });
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().replace(/^\[ERROR\] \S+ \S+ /, "") || "op failed.");
  const f = Object.fromEntries(JSON.parse(r.stdout).map((x) => [x.label, x.value]));
  if (!f.email || !f.credential) throw new Error("The 1Password item has no email or credential.");
  if (!validSite(f.site)) throw new Error("The 1Password item's site must look like name.atlassian.net.");
  if (!validBoard(f.board)) throw new Error("The 1Password item's board must be a number.");
  auth = { refs, site: f.site, board: f.board, header: `Basic ${btoa(`${f.email}:${f.credential}`)}` };
  return auth;
}

// No retries: the board asks only when opened or on r, and a 429 says to wait.
async function get(a, path, params = {}) {
  const query = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  const r = await fetch(`https://${a.site}${path}${query ? `?${query}` : ""}`, { method: "GET", headers: { Authorization: a.header, Accept: "application/json" } });
  if (r.status === 401 || r.status === 403) throw new Error(`Jira refused the token (${r.status}). It may have expired.`);
  if (r.status === 429) throw new Error("Jira says too many requests: press r in a minute.");
  if (!r.ok) throw new Error(`Jira answered ${r.status}.`);
  return r.json();
}

// The enhanced board endpoint (the /rest/agile/1.0 one is deprecated) pages with nextPageToken.
async function boardIssues(a) {
  const out = [];
  let token = null;
  for (let page = 0; page < 10; page++) {
    const params = { jql: "statusCategory != Done OR resolved >= -14d", fields: "summary,status,assignee,issuetype,priority,updated,labels", maxResults: "100" };
    if (token) params.nextPageToken = token;
    const r = await get(a, `/rest/software/1.0/board/${a.board}/issue`, params);
    out.push(...(r.issues ?? []));
    if (r.isLast || !r.nextPageToken) break;
    token = r.nextPageToken;
  }
  return out;
}

// { name, sections: [{ name: column, items }] }.
export async function fetchJira(cfg) {
  const a = await credentials(cfg);
  const [config, raw] = await Promise.all([get(a, `/rest/agile/1.0/board/${a.board}/configuration`), boardIssues(a)]);
  const at = Date.now();
  const issues = raw.map((n) => issueOf(n, a.site, at));
  return { name: config.name ?? "", sections: byColumn(columnsOf(config), issues) };
}

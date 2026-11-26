// The Jira tab's data: one board, the previewed issue and status moves (AGENTS.local.md, "Jira tab on the board").

import { exec, shared } from "herdr";
import { adfBlocks, adfToMd, avatarOf, byColumn, columnsOf, issueOf, linksOf, validBoard, validKey, validSite } from "./jira.js";

export const jiraSettings = () => {
  const s = shared("mh-jira");
  return s?.account && s?.vault && s?.item ? s : null;
};

// { refs, p }: the item read, or being read, so a reopened board waits for the same op call.
let auth = null;

function credentials(cfg) {
  const refs = JSON.stringify([cfg.account, cfg.vault, cfg.item]);
  if (auth?.refs !== refs) {
    const p = readItem(cfg);
    auth = { refs, p };
    p.catch(() => { if (auth?.p === p) auth = null; });
  }
  return auth.p;
}

async function readItem(cfg) {
  // --account: without it, op outside a terminal asks once per signed-in account.
  // </dev/null: op reads stdin when it isn't a terminal, and exec's stdin never closes.
  const r = await exec("sh", ["-c", 'exec op item get "$1" --account "$2" --vault "$3" --fields label=email,label=site,label=board,label=credential --reveal --format json </dev/null', "sh", cfg.item, cfg.account, cfg.vault], { timeout: 60000 })
    .catch((e) => { throw new Error(`Couldn't run op: ${e?.message ?? e}`); });
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().replace(/^\[ERROR\] \S+ \S+ /, "") || "op failed.");
  const f = Object.fromEntries(JSON.parse(r.stdout).map((x) => [x.label, x.value]));
  if (!f.email || !f.credential) throw new Error("The 1Password item has no email or credential.");
  if (!validSite(f.site)) throw new Error("The 1Password item's site must look like name.atlassian.net.");
  if (!validBoard(f.board)) throw new Error("The 1Password item's board must be a number.");
  return { site: f.site, board: f.board, header: `Basic ${btoa(`${f.email}:${f.credential}`)}` };
}

// No retries: the board asks only when opened or on r, and a 429 says to wait.
async function call(a, method, path, params = {}, body) {
  const query = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  const headers = { Authorization: a.header, Accept: "application/json", ...(body && { "Content-Type": "application/json" }) };
  const r = await fetch(`https://${a.site}${path}${query ? `?${query}` : ""}`, { method, headers, ...(body && { body: JSON.stringify(body) }) });
  if (r.status === 401) {
    auth = null; // r reads the item again, after the token is replaced in 1Password
    throw new Error("Jira refused the token (401). It may have expired.");
  }
  if (r.status === 403) throw new Error(method === "GET" ? `Jira says this account has no access to board ${a.board} (403).` : "Jira says this account may not change this issue (403).");
  if (r.status === 429) throw new Error("Jira says too many requests: press r in a minute.");
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    const why = [...(j?.errorMessages ?? []), ...Object.values(j?.errors ?? {})].join(" ");
    throw new Error(`Jira answered ${r.status}${why ? `: ${why}` : "."}`);
  }
  return r.status === 204 ? null : r.json();
}
const get = (a, path, params) => call(a, "GET", path, params);

// The enhanced board endpoint (the /rest/agile/1.0 one is deprecated) pages with nextPageToken.
async function boardIssues(a) {
  const out = [];
  let token = null;
  for (let page = 0; page < 10; page++) {
    const params = { jql: "statusCategory != Done OR resolved >= -14d", fields: "summary,status,assignee,issuetype,priority,labels,parent,issuelinks", maxResults: "100" };
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
  const issues = raw.map((n) => issueOf(n, a.site));
  return { name: config.name ?? "", sections: byColumn(columnsOf(config), issues) };
}

async function issueAuth(key) {
  const cfg = jiraSettings();
  if (!cfg) throw new Error("There is no mh-jira in mh-state.json.");
  if (!validKey(key)) throw new Error(`${key} is not a Jira key.`);
  return credentials(cfg);
}

// The preview (space on a Jira card), in preview.js's shape: one issue's description and comments.
export async function fetchJiraPreview(key) {
  const a = await issueAuth(key);
  const n = await get(a, `/rest/api/3/issue/${key}`, { fields: "summary,status,issuetype,priority,assignee,reporter,created,updated,labels,parent,description,comment,issuelinks" });
  const f = n.fields ?? {};
  const url = `https://${a.site}/browse/${n.key}`;
  return {
    ...issueOf(n, a.site),
    jira: true, ref: n.key,
    reporter: f.reporter?.displayName ?? "", reporterAvatar: avatarOf(f.reporter),
    created: Date.parse(f.created) || 0, updated: Date.parse(f.updated) || 0,
    links: linksOf(f, a.site),
    body: adfBlocks(f.description, url).map((md) => ({ md })),
    posts: (f.comment?.comments ?? []).map((c) => ({ who: c.author?.displayName ?? "someone", avatar: avatarOf(c.author), at: Date.parse(c.created) || 0, url: `${url}?focusedCommentId=${c.id}`, parts: [{ md: adfToMd(c.body, url) }] })),
  };
}

// s on a card: the moves Jira's workflow allows from the issue's status now.
export async function jiraTransitions(key) {
  const r = await get(await issueAuth(key), `/rest/api/3/issue/${key}/transitions`);
  return (r.transitions ?? []).map((x) => ({ id: x.id, name: x.name ?? "", to: x.to?.name ?? "", toId: String(x.to?.id ?? ""), category: x.to?.statusCategory?.key ?? "" }));
}

// The tab's only write: one of those moves.
export async function jiraTransition(key, id) {
  await call(await issueAuth(key), "POST", `/rest/api/3/issue/${key}/transitions`, {}, { transition: { id } });
}

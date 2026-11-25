// The Jira tab's pure parts (no herdr import, so node can test them: jira.test.mjs).

// Checked before they go into a URL: they come from 1Password.
export const validSite = (s) => /^[a-z0-9-]+\.atlassian\.net$/.test(s ?? "");
export const validBoard = (b) => /^\d+$/.test(b ?? "");

// The board's columns in order; same-named columns (two Backlogs on a kanban board) become one.
export function columnsOf(config) {
  const out = [];
  for (const c of config?.columnConfig?.columns ?? []) {
    const ids = (c.statuses ?? []).map((s) => String(s.id));
    const same = out.find((o) => o.name === c.name);
    if (same) ids.forEach((id) => same.statuses.add(id));
    else out.push({ name: c.name, statuses: new Set(ids) });
  }
  return out;
}

export function issueOf(n, site, at) {
  const f = n.fields ?? {};
  return {
    kind: "jira",
    key: n.key,
    url: `https://${site}/browse/${n.key}`,
    title: f.summary ?? "",
    status: f.status?.name ?? "",
    statusId: String(f.status?.id ?? ""),
    statusCategory: f.status?.statusCategory?.key ?? "",
    type: f.issuetype?.name ?? "",
    priority: f.priority?.name ?? "",
    assignee: f.assignee?.displayName ?? "",
    labels: (f.labels ?? []).map((name) => ({ name })),
    updated: Date.parse(f.updated) || at,
  };
}

// [{ name, items }] per column, in board order, issues in the order Jira gave (its rank).
// Issues in no column are left out, as the board leaves them out.
export function byColumn(columns, issues) {
  return columns
    .map((c) => ({ name: c.name, items: issues.filter((i) => c.statuses.has(i.statusId)) }))
    .filter((s) => s.items.length);
}

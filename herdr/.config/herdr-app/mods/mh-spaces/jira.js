// The Jira tab's pure parts (no herdr import, so node can test them: jira.test.mjs).

// Checked before they go into a URL: they come from 1Password.
export const validSite = (s) => /^[a-z0-9-]+\.atlassian\.net$/.test(s ?? "");
export const validBoard = (b) => /^\d+$/.test(b ?? "");

// [light, dark], as Jira colors them. Type names in English and Norwegian.
export const RED = ["#cf222e", "#f85149"], GREEN = ["#1a7f37", "#3fb950"], BLUE = ["#0969da", "#4493f8"];
const ORANGE = ["#bc4c00", "#f0883e"], PURPLE = ["#8250df", "#a371f7"];
export const PRIORITY_COLOR = { Highest: RED, High: RED, Medium: ORANGE, Low: GREEN, Lowest: BLUE };
// A color per name (an epic, a person), from the theme so it follows light and dark.
export const hue = (text, t) => [t.ansi3, t.ansi4, t.ansi5, t.ansi6, t.ansi2, t.ansi1][[...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7) % 6];
export const initials = (name) => {
  const w = name.split(/\s+/).filter(Boolean);
  return w.length ? (w[0][0] + (w.length > 1 ? w.at(-1)[0] : "")).toUpperCase() : "?";
};
// Column names as fold keys: Jira's own spelling can differ in case and spaces.
export const foldKey = (name) => name.trim().toLowerCase();

export const TYPE_COLOR = { Bug: RED, Feil: RED, Story: GREEN, Historie: GREEN, Task: BLUE, Oppgave: BLUE, "Sub-task": BLUE, Subtask: BLUE, Deloppgave: BLUE, Epic: PURPLE };

// The board's columns in order; same-named columns (two Backlogs on a kanban board) become one.
export function columnsOf(config) {
  const out = [];
  for (const c of config?.columnConfig?.columns ?? []) {
    const ids = (c.statuses ?? []).map((s) => String(s.id));
    const same = out.find((o) => o.name === c.name);
    if (same) ids.forEach((id) => same.statuses.add(id));
    else out.push({ name: c.name, statuses: new Set(ids), max: c.max ?? null });
  }
  return out;
}

// Issue links, as Jira words them from this issue's side: an inwardIssue "is blocked by", an outwardIssue "blocks".
export function linksOf(f, site) {
  return (f?.issuelinks ?? []).flatMap((l) => {
    const other = l.inwardIssue ?? l.outwardIssue;
    if (!other?.key) return [];
    const o = other.fields ?? {};
    return [{
      why: (l.inwardIssue ? l.type?.inward : l.type?.outward) ?? l.type?.name ?? "linked",
      // This issue is blocked by the other one.
      blocker: l.type?.name === "Blocks" && Boolean(l.inwardIssue),
      key: other.key, url: `https://${site}/browse/${other.key}`, title: o.summary ?? "",
      status: o.status?.name ?? "", statusCategory: o.status?.statusCategory?.key ?? "", type: o.issuetype?.name ?? "",
    }];
  });
}

// A user's picture URL; null when it isn't on a public avatar host (Jira's own needs a login).
const AVATAR_HOST = /^https:\/\/(secure\.gravatar\.com|avatar-management--avatars\.[a-z0-9-]+\.prod\.public\.atl-paas\.net)\//;
export const avatarOf = (user) => {
  const url = user?.avatarUrls?.["48x48"];
  return AVATAR_HOST.test(url ?? "") ? url : null;
};

// The open issues that block this one.
export const blockersOf = (links) => links.filter((l) => l.blocker && l.statusCategory !== "done").map((l) => l.key);

export function issueOf(n, site) {
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
    assigneeAvatar: avatarOf(f.assignee),
    parent: f.parent ? { key: f.parent.key, title: f.parent.fields?.summary ?? f.parent.key } : null,
    blockedBy: blockersOf(linksOf(f, site)),
    labels: f.labels ?? [],
  };
}

// [{ name, max, items }] per column, empty ones too, in board order, issues in the order Jira gave (its rank).
// Issues in no column are left out, as the board leaves them out.
export function byColumn(columns, issues) {
  return columns.map((c) => ({ name: c.name, max: c.max, items: issues.filter((i) => c.statuses.has(i.statusId)) }));
}

export const validKey = (k) => /^[A-Z][A-Z0-9_]*-\d+$/.test(k ?? "");

// Jira's rich text (ADF) as markdown. `url` is where media opens: the API gives no address for it.
export const adfToMd = (doc, url) => adfBlocks(doc, url).join("\n\n");

// The same markdown in pieces, one per top-level block, a heading kept with what follows it:
// the preview's j k step through them, as its scroll can only reveal whole pieces.
export function adfBlocks(doc, url) {
  // Spaces stay outside the marks: Jira's "*bold *" is not markdown emphasis.
  const mark = (text, marks = []) => {
    const [, lead, core, trail] = text.match(/^(\s*)(.*?)(\s*)$/s);
    if (!core || !marks.length) return text;
    return lead + wrap(core, marks) + trail;
  };
  const wrap = (s, marks) => {
    if (marks.some((m) => m.type === "code")) s = `\`${s}\``;
    for (const m of marks) {
      if (m.type === "strong") s = `**${s}**`;
      else if (m.type === "em") s = `*${s}*`;
      else if (m.type === "strike") s = `~~${s}~~`;
      else if (m.type === "link" && m.attrs?.href) s = `[${s}](${m.attrs.href})`;
    }
    return s;
  };
  const inline = (n) => {
    const a = n.attrs ?? {};
    if (n.type === "text") return mark(n.text ?? "", n.marks);
    if (n.type === "hardBreak") return "  \n";
    if (n.type === "mention") return a.text || "@someone";
    if (n.type === "emoji") return a.text || a.shortName || "";
    if (n.type === "inlineCard") return a.url ? `<${a.url}>` : "";
    if (n.type === "status") return `**${a.text ?? ""}**`;
    if (n.type === "date") return new Date(Number(a.timestamp)).toISOString().slice(0, 10);
    return (n.content ?? []).map(inline).join("");
  };
  const indent = (text, by) => text.split("\n").map((l, i) => (i && l ? " ".repeat(by) + l : l)).join("\n");
  const cell = (n) => blocks(n.content).replace(/\s*\n+\s*/g, " ").replaceAll("|", "\\|");
  const block = (n) => {
    const a = n.attrs ?? {};
    const kids = n.content ?? [];
    switch (n.type) {
      case "paragraph": return kids.map(inline).join("");
      case "heading": return `${"#".repeat(a.level ?? 3)} ${kids.map(inline).join("")}`;
      case "bulletList": return kids.map((li) => `- ${indent(blocks(li.content, "\n"), 2)}`).join("\n");
      case "orderedList": return kids.map((li, i) => `${(a.order ?? 1) + i}. ${indent(blocks(li.content, "\n"), 3)}`).join("\n");
      case "taskList": return kids.map((ti) => `- [${ti.attrs?.state === "DONE" ? "x" : " "}] ${(ti.content ?? []).map(inline).join("")}`).join("\n");
      case "codeBlock": return `\`\`\`${a.language ?? ""}\n${kids.map((k) => k.text ?? "").join("")}\n\`\`\``;
      case "blockquote": case "panel": return blocks(kids).split("\n").map((l) => `> ${l}`).join("\n");
      case "rule": return "---";
      case "expand": case "nestedExpand": return `**${a.title || "Details"}**\n\n${blocks(kids)}`;
      case "mediaSingle": case "mediaGroup": case "media": case "mediaInline": return `[Attachment: opens in Jira](${url})`;
      case "blockCard": case "embedCard": return a.url ? `<${a.url}>` : "";
      case "table": {
        const rows = kids.map((r) => `| ${(r.content ?? []).map(cell).join(" | ")} |`);
        const cols = kids[0]?.content?.length ?? 0;
        return rows.length ? [rows[0], `|${" --- |".repeat(cols)}`, ...rows.slice(1)].join("\n") : "";
      }
      default: return n.content ? blocks(kids) : inline(n);
    }
  };
  const blocks = (list, sep = "\n\n") => (list ?? []).map(block).filter((s) => s.trim()).join(sep);
  if (doc?.type !== "doc") return [];
  const out = [];
  let heading = null;
  for (const n of doc.content ?? []) {
    const md = block(n);
    if (!md.trim()) continue;
    if (n.type === "heading") heading = heading ? `${heading}\n\n${md}` : md;
    else out.push(heading ? `${heading}\n\n${md}` : md), (heading = null);
  }
  if (heading) out.push(heading);
  return out;
}

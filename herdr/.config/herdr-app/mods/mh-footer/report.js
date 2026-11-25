// No Herdr imports, so node can test it (report.test.mjs).

// Claude's `/context` report: the totals line and its "Estimated usage by category" table.
export function parseContext(md) {
  const num = (v) => {
    const m = String(v).trim().toLowerCase().match(/^([\d.]+)\s*([km]?)$/);
    return m ? Number(m[1]) * (m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1) : 0;
  };
  const total = md.match(/\*\*Tokens:\*\*\s*([\d.]+[km]?)\s*\/\s*([\d.]+[km]?)/i);
  const rows = [];
  let table = false;
  for (const line of (md.split("### Estimated usage by category")[1] ?? "").split("\n")) {
    if (!line.startsWith("|")) {
      if (table) break;
      continue;
    }
    table = true;
    const [name, count, pct] = line.split("|").slice(1, -1).map((c) => c.trim());
    if (name === "Category" || /^-+$/.test(name)) continue;
    rows.push({ name, tokens: num(count), pct: parseFloat(pct) || 0 });
  }
  return { used: total ? num(total[1]) : null, size: total ? num(total[2]) : null, rows };
}

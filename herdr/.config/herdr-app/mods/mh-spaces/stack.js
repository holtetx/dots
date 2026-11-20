// Board PR order, with no Herdr imports so node can test it (stack.test.mjs).

// A PR that asks for your review.
export const asks = (p) => Boolean(p.rr && !p.mine);

// A repo's PRs with each stacked PR (its base is the branch of another open PR here) under
// its parent, `depth` deep, `last` on the last child of a parent. A stack sorts as one: by a review asked of you in it, then by
// its newest update.
export function stacked(items) {
  const heads = new Map(items.filter((p) => p.branch && !p.fork).map((p) => [p.branch, p]));
  const kids = new Map();
  const roots = [];
  for (const p of items) {
    const parent = p.fork ? null : heads.get(p.base);
    if (parent && parent !== p) kids.set(parent, [...(kids.get(parent) ?? []), p]);
    else roots.push(p);
  }
  const out = [];
  const walk = (p, depth) => {
    if (out.includes(p)) return [asks(p), p.updated];
    p.depth = depth;
    out.push(p);
    let key = [asks(p), p.updated];
    const mine = (kids.get(p) ?? []).sort((a, b) => b.updated - a.updated);
    for (const k of mine) {
      k.last = k === mine.at(-1);
      const [ask, at] = walk(k, depth + 1);
      key = [key[0] || ask, Math.max(key[1], at)];
    }
    return key;
  };
  const stacks = roots.map((r) => {
    const from = out.length;
    const key = walk(r, 0);
    return { key, rows: out.splice(from) };
  });
  // Two PRs based on each other have no root: shown flat.
  const rest = items.filter((p) => !stacks.some((s) => s.rows.includes(p))).map((p) => ({ key: [asks(p), p.updated], rows: [Object.assign(p, { depth: 0 })] }));
  return [...stacks, ...rest].sort((a, b) => b.key[0] - a.key[0] || b.key[1] - a.key[1]).flatMap((s) => s.rows);
}

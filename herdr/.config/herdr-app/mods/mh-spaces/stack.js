// Board PR order, with no Herdr imports so node can test it (stack.test.mjs).

export const asks = (p) => Boolean(p.rr && !p.mine);

// A stack (a PR whose base is the branch of another open PR here) sorts as one row group, so a review asked in a child lifts the whole stack.
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

// Stacks fold under their root: each root gets its stack in `kids`, each child its root's url.
// The rows of the folded stacks (roots not in `open`) are left out, unless `all` (a search shows every match).
export function foldStacks(rows, open, all) {
  let root = null;
  for (const p of rows) {
    if (p.depth === 0) (root = p), (p.kids = []), (p.root = null);
    else if (root) root.kids.push(p), (p.root = root.url);
  }
  return all ? rows : rows.filter((p) => p.depth === 0 || open.has(p.root));
}

// `git worktree list --porcelain` as [{ path, head, branch }] (branch null when detached).
export const worktreesOf = (text) =>
  text.split("\n\n").filter((b) => b.startsWith("worktree ")).map((b) => {
    const line = (key) => b.split("\n").find((l) => l.startsWith(`${key} `))?.slice(key.length + 1) ?? null;
    return { path: line("worktree"), head: line("HEAD"), branch: line("branch")?.replace(/^refs\/heads\//, "") ?? null };
  });

// The checkouts that hold this PR (on its branch, or a review-<number> folder as the review-pr skill makes) and are not at its newest commit.
export const offHead = (p, worktrees) =>
  worktrees.filter((w) => ((!p.fork && w.branch === p.branch) || w.path.split("/").pop() === `review-${p.number}`) && p.oid && w.head !== p.oid);

// No Herdr imports, so node can test it (remote.test.mjs). mh-copy/main.js has a copy: keep them the same.

// "owner/name" of a GitHub remote URL, or null.
// shortcut: a git@<host>: remote counts as GitHub (ssh host aliases), upgrade if a non-GitHub ssh remote shows up
export function githubRepo(remote) {
  const m = (remote ?? "").trim().match(/(?:github\.com[:/]|^git@[^:/\s]+:)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

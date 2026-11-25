// Host blocks in an ssh config and the files it Includes (globs too, as ssh reads them).
// A "# comment" line right above a Host line is its note ("Office PC"). No Herdr imports, so
// node can test it (hosts.test.mjs): io is { home, read(file) -> text | null, glob(pattern) -> [file] }.
export async function readHosts(file, io, seen = new Set(), out = new Map()) {
  if (seen.has(file) || seen.size > 20) return out;
  seen.add(file);
  const text = await io.read(file);
  let note = "";
  let current = [];
  for (const raw of (text ?? "").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("#")) {
      note = line.replace(/^#+\s*/, "");
      continue;
    }
    const [key = "", ...rest] = line.split(/[\s=]+/);
    const value = rest.join(" ");
    const k = key.toLowerCase();
    if (k === "include") {
      for (const p of rest) {
        const path = p.replace(/^~(?=\/|$)/, io.home);
        const full = path.startsWith("/") ? path : `${io.home}/.ssh/${path}`;
        for (const f of /[*?[]/.test(full) ? await io.glob(full) : [full]) await readHosts(f, io, seen, out);
      }
    } else if (k === "host") {
      current = rest.filter((a) => !/[*?!]/.test(a) && !out.has(a)).map((alias) => ({ alias, note, hostname: "", port: "" }));
      for (const h of current) out.set(h.alias, h);
    } else if (k === "match") current = [];
    else if (k === "hostname") for (const h of current) h.hostname = value;
    else if (k === "port") for (const h of current) h.port = value;
    note = "";
  }
  return out;
}

// Whether `hostname` from mh-ssh covers this HostName: ending in a dot it is a network
// prefix ("10.0.0."), else it must match exactly, so "10.0.0.1" never covers 10.0.0.12.
export const covers = (hostname, resolved) => (hostname.endsWith(".") ? resolved.startsWith(hostname) : resolved === hostname);

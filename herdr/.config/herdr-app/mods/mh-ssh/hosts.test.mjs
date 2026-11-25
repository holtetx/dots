// Run: node mods/mh-ssh/hosts.test.mjs
import assert from "node:assert";
import { covers, readHosts } from "./hosts.js";

const files = {
  "/h/.ssh/config": "Include config.d/*\nInclude ~/extra\n# Office PC\nHost pc office\n  HostName 10.0.0.5\n  Port 2222\nHost *\n  User me\n",
  "/h/.ssh/config.d/a": "Host a-ruter\n  HostName=10.0.1.1\nMatch host x\n  HostName ignored\nHost pc\n  HostName twice\n",
  "/h/.ssh/config.d/b": "Include /h/.ssh/config\nHost b\n",
  "/h/extra": "Host e\n",
};
const io = { home: "/h", read: async (f) => files[f] ?? null, glob: async (p) => Object.keys(files).filter((f) => f.startsWith(p.replace("*", ""))).sort() };
const hosts = await readHosts("/h/.ssh/config", io);
// The first block for an alias wins, as in ssh: pc comes from config.d/a, read at the Include.
assert.deepStrictEqual([...hosts.keys()], ["a-ruter", "pc", "b", "e", "office"]);
assert.strictEqual(hosts.get("pc").hostname, "twice");
assert.deepStrictEqual(hosts.get("office"), { alias: "office", note: "Office PC", hostname: "10.0.0.5", port: "2222" });
assert.strictEqual(hosts.get("a-ruter").hostname, "10.0.1.1");
assert.strictEqual(hosts.get("b").note, "");

assert.ok(covers("10.0.0.", "10.0.0.12") && !covers("10.0.0.", "10.0.1.2"));
assert.ok(covers("10.0.0.1", "10.0.0.1") && !covers("10.0.0.1", "10.0.0.12"));
console.log("ok");

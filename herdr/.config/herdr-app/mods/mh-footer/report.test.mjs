// Run: node mods/mh-footer/report.test.mjs
import assert from "node:assert";
import { parseContext } from "./report.js";

const md = `## Context Usage

**Model:** x
**Tokens:** 61.2k / 1m (6%)

### Estimated usage by category

| Category | Tokens | Percentage |
|----------|--------|------------|
| System prompt | 3.1k | 0.3% |
| Messages | 52k | 5.2% |
| Free space | 938.8k | 93.9% |

### MCP Tools
| Tool | Tokens |
| x | 1k |
`;
assert.deepStrictEqual(parseContext(md), {
  used: 61200,
  size: 1e6,
  rows: [
    { name: "System prompt", tokens: 3100, pct: 0.3 },
    { name: "Messages", tokens: 52000, pct: 5.2 },
    { name: "Free space", tokens: 938800, pct: 93.9 },
  ],
});
assert.deepStrictEqual(parseContext("no report"), { used: null, size: null, rows: [] });
console.log("ok");

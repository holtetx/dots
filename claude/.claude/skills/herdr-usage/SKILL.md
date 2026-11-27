---
name: herdr-usage
description: Review how the owner uses their Herdr setup (the mh-* mods and Herdr's own commands) from the usage log on this Mac, and propose what to remove, improve or keep. Use for "review my herdr usage", "herdr stats", "what do I use in herdr", or /herdr-usage.
---

1. Run `node ~/.config/herdr-app/mods/mh-tabs/usage-report.mjs`. It covers the last 7 days.
2. Read `~/.config/herdr-app/AGENTS.local.md`: what each feature does, "Decided against" and the board choices. Do not propose to remove something the owner chose there without asking.
3. Give three lists, at most 5 items each, most important first. Give the files for each item.
   - **Remove**: no use, or very few uses, and it costs code (commits per mod, lines).
   - **Improve**: used a lot (make it faster), many quick escapes (the dialog was opened by mistake or did not help), always clicked when a key exists (or the reverse), a tip shown and not used after.
   - **Keep**: the top uses.
4. Propose changes to `~/.config/herdr-app/mods/mh-tabs/tips.json`: drop tips for features in daily use, add tips for unused features that stay.
5. Change no files. Wait for the owner to pick.

## The log

- `~/.config/herdr-app/mh-stats/YYYY-MM.jsonl`, one line per use: `{"t", "src": "mh" | "herdr", "f", "via"}`. Each Mac has its own log.
- `f`: `<mod>.<area>.<what>` for mh-* features (`mh-spaces.board.jira.n` is the `n` key on the board's Jira tab), a Herdr command name for Herdr's own.
- `via`: `open` (a dialog opened), `key`, `click`, `menu`, `drag`, `wheel`, `do` (a dialog's action finished), `state` (Herdr's own, seen as a change in spaces, tabs, panes or layout), `tip` (a "did you know" toast, not a use).
- Not logged: Herdr keys no mod sees (copy, paste, search, app keys), and plain typing and moves (arrows, `j`, `k`) in dialogs. Say so; do not guess their use.
- A log shorter than 7 days can not show "never used". Say so.

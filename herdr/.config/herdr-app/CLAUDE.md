# Herdr config

Read these first. They are in `~/.config/herdr-app`:

- `AGENTS.md`: Herdr's manual (layouts, keys, settings, mods, the `herdr-app` and `hc` commands). Herdr rewrites it on every start.
- `herdr.d.ts` and `gpui-kit.d.ts`: the mod API. They win where the manual and the code disagree.

## Where the files live

- `~/.config/herdr-app` is a link to `~/dots/herdr/.config/herdr-app`. The `.gitignore` there lists the tracked files. All other files are Herdr's.
- Do not edit Herdr's own mods and layouts. Clone them (`mod.clone`, `layout.clone`).
- The `mh-*` mods are forks of jnatten's `jj-*` mods (github.com/jnatten/dots), changed to git only, no Trello, no 1Password.
- Claude Code side: stow package `claude` in dots. `hooks/statusline.sh` sets the `claude.session`, `claude.cwd`, `claude.context` and `claude.context_size` labels and writes `~/.cache/herdr-claude/limits.json`. `hooks/herdr-activity.sh` sets `claude.subagents` and `claude.shells`, and removes all `claude.*` labels at SessionEnd. `claude.cwd` is the project folder. `~/.claude/settings.json` (not in dots) runs both.

## Where state lives

| What | Where | Writer |
|---|---|---|
| Spacing dialog settings | `mh-settings.json` (in dots) | `mods/mh-footer/settings.js`, synced with `shared()` |
| Space colors, folded folders, board repos (`mh-board`) | `mh-state.json` (this Mac, not in dots) | same file. `new-window.sh` makes it. |
| Links added by hand, the Waiting mark | herdr-core doc `mh-links` | `mods/mh-spaces/docs.js`, `~/.claude/skills/herdr-link/herdr-link.mjs` |
| Which Claude session had which links | herdr-core doc `mh-tasks`, shared as `shared("tasks.sessions")` | mh-spaces (`history.mjs` reads the transcripts) |
| Space folders | herdr-core doc `mh-folders` | mh-spaces only. Other mods ask through `shared("space-folders.ask")`. |
| Session title | label `mh.description` | skills, with `hc label` |

## Sidebar

One list: folders (projects), then spaces. A space is one session. Its row shows its name when someone renamed it, else its most urgent agent's `mh.description` label or title (`mods/mh-spaces/title.js`), and that agent's status. `cmd-[` / `cmd-]` (`mh-tabs`) go through the agents of the spaces the sidebar shows, in its order.

## PR badges

A badge on a space comes from a `pr-link` line in the session's transcript (Claude Code writes it when it opens a PR) or from herdr-link. A URL typed in a prompt reaches only the tasks list (`ctrl-a t`). Both need the `claude.session` label.

A space takes its git info from the folder of its first tab. A space made in the wrong folder shows the wrong badges.

## Board (`ctrl-a T`)

Choices the owner made. Do not change them without a question.

- Repos: those found in the sidebar folders, plus `mh-board.repos`. `mh-board` is in `mh-state.json`, not in dots: this repo is public and the repo names are internal. A `git@<host>:owner/repo` remote counts as GitHub (ssh host aliases).
- Repos whose `owner/repo` name contains an entry of `mh-board.hide` are hidden.
- PRs are asked for in three separate `gh` calls. One combined query gives HTTP 502.
- Both tabs are grouped by repo. There are no status groups. A stacked PR (its base is the branch of another open PR in the repo) sits under its parent with an indent (`mods/mh-spaces/stack.js`, test: `node mods/mh-spaces/stack.test.mjs`).
- A yellow `review` label marks a PR where GitHub says the owner's review is requested. PRs with the label come first in their repo.
- Each PR row shows `N approved`, `N changes`, a comment count (GitHub `totalCommentsCount`) and `CI` with its state. Use words, not icons alone.
- A board session on a PR branch moves the local branch to origin: fast-forward, or after a force-push a reset when the branch has no commits or changes of its own. Otherwise it stops with an error.
- A yellow `behind` label marks a PR with a checkout here that does not have the PR's newest commit (new commits or a force-push). A checkout is a worktree on the PR's branch, or a `review-<number>` folder as the `review-pr` skill makes. Only repos with a space or a sidebar folder are checked.
- Not tested: worktree recreate on resume.

## Decided against

- No `cmd-s` key, no tmux split, rename or layout keys.
- No agents list and no session archive in the sidebar.
- `review-pr` (a shared team skill) does not call herdr-link. A rule in `~/.claude/CLAUDE.md` does that.
- The worktree options stay (`alt-shift-c`, picker, board and tasks rows).

## More windows

A second window closes with `cmd-q`.


`new-window.sh` (`cmd-shift-n`) makes `~/.config/herdr-app-2`, `-3` and so on, with this setup's files linked in. To ask one window: `HERDR_APP_HOME=~/.config/herdr-app-2 herdr-app status`.

## Working on mods

- Check: `herdr-app check mods/<mod>` after each change. It renders only the default state of a mod.
- Errors and focus: `herdr-app status`. Screenshot: `herdr-app shot <file>.png`. Labels: `hc get <terminal> --json`.
- Reload: Herdr does not always see an edit made through a link. Run `touch -h` on the link of the mod or of `keys.json` in `~/.config/herdr-app`.
- Layout: change it with `herdr-app do layout.set`.
- Herdr adds `gpui-kit.d.ts` and `jsconfig.json` to mod folders. They are ignored by git.

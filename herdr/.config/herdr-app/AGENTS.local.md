# Herdr config

Read these first. They are in `~/.config/herdr-app`:

- `AGENTS.md`: Herdr's manual (layouts, keys, settings, mods, the `herdr-app` and `hc` commands). Herdr rewrites it on every start.
- `herdr.d.ts` and `gpui-kit.d.ts`: the mod API. They win where the manual and the code disagree.

## Where the files live

- `~/.config/herdr-app` is a link to `~/dots/herdr/.config/herdr-app`. The `.gitignore` there lists the tracked files. All other files are Herdr's.
- Do not edit Herdr's own mods and layouts. Clone them (`mod.clone`, `layout.clone`).
- The `mh-*` mods are git only. `mh-ssh` (ssh passwords) and the board's Jira tab use `op` (1Password).
- Claude Code side: stow package `claude` in dots. `hooks/statusline.sh` sets the `claude.session`, `claude.cwd`, `claude.context` and `claude.context_size` labels and writes `~/.cache/herdr-claude/limits.json`. `hooks/herdr-activity.sh` keeps `claude.running`: the running subagents and background shells, which have no terminal of their own, as JSON `[{kind: "agent" | "shell", name, detail, file}]`, oldest first. It removes all these labels at SessionEnd. The sidebar lists them under the space's row (`runningRows` in `mods/mh-spaces/main.js`). A click shows the subagent's transcript or the shell's output, live, in a peek until it ends (`mods/mh-spaces/follow.sh`); not on another machine's space. `claude.cwd` is the project folder. `~/.claude/settings.json` (not in dots) runs both; `hooks/install.sh` adds them there.

## Where state lives

All `mh-state.json` keys, their shape and which Mac needs them: README.md in dots, "Herdr: this Mac's settings". Keep that list in step with `FILES` in `mods/mh-footer/settings.js`.

| What | Where | Writer |
|---|---|---|
| Spacing dialog settings | `mh-settings.json` (in dots) | `mods/mh-footer/settings.js`, synced with `shared()` |
| Space colors, folded folders, board repos (`mh-board`) | `mh-state.json` (this Mac, not in dots) | same file. `new-window.sh` makes it. |
| Links added by hand, the Waiting mark | herdr-core doc `mh-links` | `mods/mh-spaces/docs.js`, `~/.claude/skills/herdr-link/herdr-link.mjs` |
| Which Claude session had which links | herdr-core doc `mh-tasks`, shared as `shared("tasks.sessions")` | mh-spaces (`history.mjs` reads the transcripts) |
| Space folders | herdr-core doc `mh-folders` | mh-spaces only. Other mods ask through `shared("space-folders.ask")`. |
| Session title | label `mh.description` | skills, with `hc label` |
| SSH: 1Password reference, Claude's folder (`mh-ssh`) | `mh-state.json` | by hand, on the work Mac only |
| Jira board (`mh-jira`), lunch canteen (`mh-lunch`) | `mh-state.json` | by hand, on the work Mac only |
| Which space is an SSH space | label `mh.ssh=<host>` on its ssh terminal | `mods/mh-ssh` |

## Key list (`cmd-/`, `ctrl-a ?`)

`mods/mh-help` lists every binding in `keys.json` with words from its `DESCRIBE` table. When you add or change a key, give it a line there. A key without a line shows Herdr's text and "no description". Keys inside lists (board, tasks, copy mode) are not in it: each list shows them in its own key hints. `cmd-shift-/` is Herdr's raw list.

## Sidebar

One list: folders (projects), then spaces. A space is one session. Its row shows its name when someone renamed it, else its most urgent agent's `mh.description` label or title (`mods/mh-spaces/title.js`), and that agent's status. The folder `+` and `cmd-shift-c` start a space with `claude`. Each folder, Other and SSH list their spaces by recent activity: the newest `changed_at` of their tabs (an agent's state change), so there is no order by hand. `cmd-k` (`mh-sessions`) lists Spaces the same way and Open sessions by agent `seq`. `cmd-[` / `cmd-]` (`mh-tabs`) go through the agents of the spaces the sidebar shows, in its order.

## SSH (`ctrl-a s`)

- `mods/mh-ssh` lists the hosts in `~/.ssh/config` and its `Include`s, globs too (`mods/mh-ssh/hosts.js`, test: `node mods/mh-ssh/hosts.test.mjs`). Enter opens a space named after the host with ssh in it. ⌘Enter also opens Claude on the right with a system prompt about the host; on a host that is already open it adds Claude to its space. With 10 hosts or fewer (`FEW`), all show before you type. In an SSH space the dialog starts with its host first and selected, so `ctrl-a s`, ⌘Enter adds Claude there.
- The ssh pane is the control master (`~/.ssh/mh-<host>.sock`). Claude runs commands through it with `ssh -S <sock> -o ProxyCommand=false`, so a closed connection fails at once and never starts a new login. Logout (ctrl-d, `exit`) or ctrl-c in the ssh pane closes the space. A lost connection (ssh exit 255) waits for Enter and connects again, so Claude keeps its session. Closing the space ends both.
- `mh-ssh` in `mh-state.json`, all optional: `op` (an `op://` reference, or a map from Host alias ending, e.g. `-ruter`, to reference with `"*"` for the rest: `askpass.sh` fills password prompts from it), `hostname` (only hosts whose HostName in `ssh -G` it covers, and with no ProxyJump and no ssh in ProxyCommand, get a password; without it, no host does; ending in a dot it is a network prefix, e.g. `10.0.0.`, else one exact HostName) and `folder` (where Claude starts, default `~`). Set only on the work Mac. At home, keys come from the 1Password ssh agent.
- A new host key: with `StrictHostKeyChecking ask`, `askpass.sh` fails the question, so run `ssh <host>` once by hand. With `accept-new` (set by some team ssh configs), ssh takes a new key without asking and then sends the password.
- Claude is told not to run `op` (`--disallowedTools "Bash(op *)"`). This is a soft guard: a full path or `sh -c` gets past it.
- The sidebar lists these spaces under SSH, after Other.

## PR badges

A badge on a space comes from a `pr-link` line in the session's transcript (Claude Code writes it when it opens a PR) or from herdr-link. A URL typed in a prompt reaches only the tasks list (`ctrl-a t`). Both need the `claude.session` label.

A space takes its git info from the folder of its first tab, or from that terminal's `claude.cwd` label when it has one (`claude --worktree` works there). Its tooltip adds `(worktree)` after a branch in a worktree. A space made in the wrong folder shows the wrong badges. A branch's PR shows only on a space that is alone on that repo and branch: spaces that share a checkout get it only through a transcript or herdr-link.

## Git bar

The `git` block under the terminal is `mh-spaces` with props `{ bar: true }` (`mods/mh-spaces/bar.js`). It shows the shown space's branch, ahead/behind, uncommitted changes and PR badges. Branch and ahead/behind come from the sidebar copy through `shared("git.spaces")`. The bar polls the changes itself every 5 s. The branch diff compares with the base of the branch's PR (stacked branches), else with `origin/HEAD`. A mod can not import from another mod's folder, so the bar lives in `mh-spaces` to reuse `badge()` from `github.js`.

## Board (`ctrl-a T`)

Choices the owner made. Do not change them without a question.

- Repos: those found in the sidebar folders, but those in `mh-board.skip` (`owner/repo`, any case), plus `mh-board.repos`. `mh-board` is in `mh-state.json`, not in dots: this repo is public and the repo names are internal. A `git@<host>:owner/repo` remote counts as GitHub (ssh host aliases).
- Repos whose `owner/repo` name contains an entry of `mh-board.hide` are hidden.
- PRs are asked for in three separate `gh` calls. One combined query gives HTTP 502.
- The PR and issue tabs are grouped by repo. There are no status groups. A stacked PR (its base is the branch of another open PR in the repo) sits under its parent with an indent (`mods/mh-spaces/stack.js`, test: `node mods/mh-spaces/stack.test.mjs`).
- A yellow `review` label marks a PR where GitHub says the owner's review is requested. PRs with the label come first in their repo.
- Each PR row, left to right: `#number`, title, labels, comment count (GitHub `totalCommentsCount`), links, author, `+added -deleted`, age, one review word (`needs review`, `in review`, `approved`, `changes`, `draft`, `queued`; GitHub's `reviewDecision`, else the latest reviews; a change request shows unless GitHub says approved; `in review` when a person other than the author reviewed or commented, bots do not count) and `CI` with its state. Use words, not icons alone.
- The title line is the tabs in a fixed order (Pull requests, Issues, Jira; the shown one highlighted), the refresh state and the main keys. Hover the keys for all of them. A line under the list shows only when there is a note.
- `/` opens a search field under the title line. It filters the shown tab by ref, title, repo, author, branch, assignees and labels; every word must match. `↵` keeps the filter, `esc` clears it.
- Dependabot PRs are hidden each time the mod loads. `b`, or the `Dependabot hidden N` button on the title line, shows them until the next load.
- A board session on a PR branch moves the local branch to origin: fast-forward, or after a force-push a reset when the branch has no commits or changes of its own. Otherwise it stops with an error.
- A yellow `behind` label marks a PR with a checkout here that does not have the PR's newest commit (new commits or a force-push). A checkout is a worktree on the PR's branch, or a `review-<number>` folder as the `review-pr` skill makes. Only repos with a space or a sidebar folder are checked.
- Not tested: worktree recreate on resume.

## Jira tab on the board (work Mac only)

- Shows when `mh-jira` is in `mh-state.json`: `{ "account": "<1Password account URL>", "vault": "...", "item": "..." }`. The item has the fields `email`, `site`, `board` and `credential` (an Atlassian API token). Without `mh-jira` there is no Jira tab.
- One Jira board only. `mods/mh-spaces/jira-data.js` sends `GET` to `/rest/agile/1.0/board/<board>/configuration` and `/rest/software/1.0/board/<board>/issue` (the `/rest/agile/1.0` issue path is deprecated), `/rest/api/3/issue/<key>` for the preview (only on `space`) and `/rest/api/3/issue/<key>/transitions` (only on `s`). The only write is `POST /rest/api/3/issue/<key>/transitions` (only on `↵` in the `s` list). Never add other Jira calls without a question.
- Cards: open issues and those done in the last 14 days (`statusCategory != Done OR resolved >= -14d`), in the board's columns side by side, in Jira's rank order. Swimlanes are not shown: the public API does not return their queries.
- A card: title, parent (epic) tag, priority word, a red `blocked` tag when an open issue blocks it (`issuelinks`), type color, key (struck through when done), assignee initials. The left edge has the priority color. A column header is red when it has more cards than the board's max.
- `h l` move between columns, `j k` between cards, `z` folds or opens a column (also a click on its header). Backlog and the columns in `mh-jira.folded` (a list of names) start folded; the choice is kept in the mod's `localStorage` (`jira.folded`), names in lower case and trimmed.
- `s` on a card or in its preview opens `mods/mh-spaces/status.js`: a dialog with the statuses Jira's workflow allows a move to, as colored chips (the current one is in the header, not in the list). It is its own dialog, so `esc` closes only it. `1`-`9` or `↵` makes a move and sets `shared("jira.moved")`: the board reloads the Jira tab and keeps the card selected, and the preview reloads. Jira's error shows in the dialog (a move with a required field, such as a resolution, fails).
- `space` previews an issue in `preview.js`, laid out as Jira shows it: title on top, description, linked issues and comments on the left, fields on the right. On a linked issue `↵` previews it and `^O` goes back. The text is Jira's rich text (ADF) made markdown by `adfToMd` in `jira.js`. Attachments need a login, so they are a link to the issue.
- The token: one `op item get` per Herdr run, when the Jira tab first shows, and again after a 401 (a replaced token). Kept in memory only, sent with `fetch`, never in a process list. `op` needs `--account` (3 accounts: without it, op asks once per account) and `</dev/null` (op reads stdin when it is not a terminal, and `exec` never closes stdin, so op waits forever and Herdr freezes).
- No retries: a 429 says to press `r` later. The tab asks Jira only while it shows.
- Test: `node mods/mh-spaces/jira.test.mjs`.

## Preview (`space` on the board, `ctrl-space` in the tasks list)

- `mods/mh-spaces/preview.js`, an mh-spaces overlay `{ preview: url, behind?, back }`. `back` is the shared key it sets when it closes, so the list under it takes the keyboard back (`board.focus`, `tasks.focus`). The status dialog over a preview uses `preview.focus` the same way.
- Data: a Jira URL (`/browse/<key>`) goes to `fetchJiraPreview` in `jira-data.js`. Else one `gh` GraphQL query (`preview-data.js`). It shows reviews, failing and running checks, the description, comments, review bodies and unresolved review threads.
- Images: `curl` downloads them into `mh-cache/preview` in Herdr's folder (`image()` reads only there; git ignores it). Only GitHub hosts, and for Jira user pictures (board cards and preview) only Gravatar and Atlassian's public avatar host (`avatarOf` in `jira.js`). Pictures on the Jira site itself need a login: those users get initials. Files older than 30 days are deleted. Videos open in the browser.
- Herdr's `fs/promises` has no working `rename`: use `mv`.

## Lunch (`ctrl-a l`)

- `mods/mh-lunch`: this week's dishes in a canteen from `api.izy.as` (header `Building-Id`). The canteen is `mh-lunch` in `mh-state.json`: `{ "canteen": "<id>", "building": "<id>" }`, strings of digits, set by hand on the work Mac only. Without it (the home Mac) `ctrl-a l` and the palette entry close at once, and the key list leaves the key out. Without a `week` the API gives the current week. Today is a large card, past days are dimmed.
- Emojis come from a word list in `mods/mh-lunch/emoji.js`, in the order the words come in the dish name. A dish with no known word gets 🍽️. Test: `node mods/mh-lunch/emoji.test.mjs`.

## Decided against

- No `cmd-s` key, no tmux split, rename or layout keys.
- No agents list and no session archive in the sidebar.
- `review-pr` (a shared team skill) does not call herdr-link. A rule in `~/.claude/CLAUDE.md` does that. Both are on the work Mac only, not in dots.
- The worktree options stay (`alt-shift-c`, picker, board and tasks rows).
- No generated lunch images: Claude's SVG drawings looked bad, and the Gemini free tier allows 0 image requests.

## More windows

A second window closes with `cmd-q`.


`new-window.sh` (`cmd-shift-n`) makes `~/.config/herdr-app-2`, `-3` and so on, with this setup's files linked in. To ask one window: `HERDR_APP_HOME=~/.config/herdr-app-2 herdr-app status`.

## Working on mods

- Check: `herdr-app check mods/<mod>` after each change. It renders only the default state of a mod.
- Tests: `node --test mods/*/*.test.mjs`. Code a test needs lives in a file with no Herdr imports (`jira.js`, `stack.js`, `remote.js`, `title.js`, `mh-ssh/hosts.js`, `mh-footer/report.js`).
- Errors and focus: `herdr-app status`. Screenshot: `herdr-app shot <file>.png`. Labels: `hc get <terminal> --json`.
- Reload: Herdr does not always see an edit made through a link. Run `touch -h` on the link of the mod or of `keys.json` in `~/.config/herdr-app`.
- Layout: change it with `herdr-app do layout.set`.
- `tab` and `shift-tab` never reach `on_key_down`: the app binds them to focus movement. Bind them to an action of your own in a `key_context` (`cx.bind_keys` in `init`, `.key_context(...).on_action(...)` on the root), as the board and the spacing dialog do.
- `exec` never closes stdin: a program that reads stdin when it is not a terminal (`op`) waits forever. Run it as `sh -c '... </dev/null'`.
- Herdr adds `gpui-kit.d.ts` and `jsconfig.json` to mod folders. They are ignored by git.
- A popup grows with its content. A child with `flex_1().min_h(0)` gets 0 px in it, and an overlay `"height": 0` shows nothing.

# Herdr config

Read these first. They are in `~/.config/herdr-app`:

- `AGENTS.md`: Herdr's manual (layouts, keys, settings, mods, the `herdr-app` and `hc` commands). Herdr rewrites it on every start.
- `herdr.d.ts` and `gpui-kit.d.ts`: the mod API. They win where the manual and the code disagree.

## Where the files live

- `~/.config/herdr-app` is a link to `~/dots/herdr/.config/herdr-app`. The `.gitignore` there lists the tracked files. All other files are Herdr's.
- Do not edit Herdr's own mods and layouts. Clone them (`mod.clone`, `layout.clone`).
- The `mh-*` mods are git only. `mh-ssh` (ssh passwords) and the board's Jira tab use `op` (1Password).
- Claude Code side: stow package `claude` in dots. `hooks/statusline.sh` sets the `claude.session`, `claude.cwd`, `claude.context` and `claude.context_size` labels and writes `~/.cache/herdr-claude/limits.json`. `hooks/herdr-activity.sh` keeps `claude.running`: the running subagents and background shells, which have no terminal of their own, as JSON `[{kind: "agent" | "shell", name, detail, file}]`, oldest first. It removes all these labels at SessionEnd. The sidebar lists them under the space's row (`runningRows` in `mods/mh-spaces/main.js`). A click shows the subagent's transcript or the shell's output, live, in a peek until it ends; Esc closes it (`mods/mh-spaces/follow.sh`); not on another machine's space. `claude.cwd` is the project folder. `~/.claude/settings.json` (not in dots) runs both; `hooks/install.sh` adds them there.

## Look

Inspired by Pixel HQ (github.com/bnhan2710/pixel-hq), built by hand.

- Theme `themes/pixel-hq.json`: Catppuccin Mocha with Pixel HQ's window colors. The `layouts/mh.json` root sets it, JetBrains Mono for terminals and mods, and terminal padding 16 by 14.
- Cards: the root has padding 8 and gap 8. The sidebar, tab bar, panes, side panel and git bar are rounded cards (radius 12). The spacing dialog's defaults match (gap 8, padding 16 by 14).
- `mods/mh-spaces/pixel.js`, copied unchanged into each mh-* mod that uses it (mods can't import each other): `button()` (rounded 6, 1px frame, brighter when on) for buttons, toggles and tabs, `frame()` for inputs and cards, `chip()` for tinted pills, `mark()` for an agent's status (`px-spinner.svg` turning, `px-bang.svg`, `px-tick.svg`, nothing when idle), `WORDS` for status words (needs you, working, done, idle), `ink()` for text on a colored tile, `keyPanel()` for a dialog's `?` panel (keys and marks). Rows and small icon buttons are rounded 6; the sidebar's space rows and Jira cards are rounded 8. Section headers are in caps. The shown tab is a soft lavender pill (`#b4befe` tint, rounded 10) with a status dot (working and blocked pulse) and its close mark, as in Pixel HQ's preview; other tabs are plain.
- Toasts (`mh-toast`): a framed card with no Herdr frame (`mod.json` overlay frame none). The title on the first line; a chip (`NEEDS YOU`, `DONE`, `ERR`, `WARN`, `OK`, `INFO`) with the space and branch, or the body, on the second. `ctrl-a N` (`mh-tabs.test-toast`) shows a sample, the next kind each time.
- Pane headers: `mods/mh-pane` (a clone of Herdr's `pane`), always shown, 36 px: program, folder (folder and branch in its tooltip), the pane's status chip. The session title shows as a chip only in a split tab: the tab already shows it.
- Git bar: branch, diff, PRs, then `N on the team` and a count per status (`team()` in `bar.js`). A click goes to the next agent in that state.
- Sidebar: folders use Pixel HQ's metro line colors (`MARK` in `folders.js` and its copies). Under a folder's name, its checkout's branch on a faint tint of the folder's color, with no outline (`branchLine()`; `checkoutBranch()` picks the one most of its spaces share). The track is a solid, softened version of the folder's color (`soften()`) and ends at the last station. A station per space is framed in the folder's color and filled with its status color while an agent is busy (working pulses slowly and keeps its spinner on the right, blocked pulses fast); the shown space has a light core. A row gets a second line only with something of its own: the space name when the title is a session and no folder names it, a branch other than the folder's (a worktree), `N agents` from 2. A space with two or more busy agents gets count chips. Subagent rows sit on the track with a blue spinner.
- A PR with new activity has a small yellow square on its icon (sidebar and board).
- The footer's limits are 5-segment gauges. `mh-tabs` sets the Dock badge to the number of agents that need you.
- Folder and space colors: `MARK` (folders.js and its copies in mh-sessions, mh-picker, mh-panes), 12 soft colors; new spaces get one of the first 6. Fixed colors: GitHub and Jira states are Catppuccin pairs `[Latte, Mocha]`, defined once in `mods/mh-spaces/jira.js`.

## Where state lives

All `mh-state.json` keys, their shape and which Mac needs them: README.md in dots, "Herdr: this Mac's settings". Keep that list in step with `FILES` in `mods/mh-footer/settings.js`.

| What | Where | Writer |
|---|---|---|
| Spacing dialog settings | `mh-settings.json` (in dots) | `mods/mh-footer/settings.js`, synced with `shared()` |
| Space colors, folded folders, board repos (`mh-board`) | `mh-state.json` (this Mac, not in dots) | same file. `new-window.sh` makes it. |
| Links added by hand, the Waiting mark | herdr-core doc `mh-links` | `mods/mh-spaces/docs.js`, `~/.claude/skills/herdr-link/herdr-link.mjs` |
| Which Claude session had which links | herdr-core doc `mh-tasks`, shared as `shared("tasks.sessions")` | mh-spaces (`history.mjs` reads the transcripts) |
| Watched PRs (`{ prs: { url: { seen?, snooze? } } }`) | herdr-core doc `mh-watch` on this Mac | `mods/mh-spaces/watch.js`. Other copies ask through `shared("watch.ask")`. |
| Space folders | herdr-core doc `mh-folders` | mh-spaces only. Other mods ask through `shared("space-folders.ask")`. |
| Session title | label `mh.description` | skills, with `hc label` |
| SSH: 1Password reference, Claude's folder (`mh-ssh`) | `mh-state.json` | by hand, on the work Mac only |
| Jira board (`mh-jira`), lunch canteen (`mh-lunch`) | `mh-state.json` | by hand, on the work Mac only |
| Which space is an SSH space | label `mh.ssh=<host>` on its ssh terminal | `mods/mh-ssh` |
| Usage log (`mh-stats/YYYY-MM-DD.jsonl`, one file a day, this Mac, not in dots) | `~/.config/herdr-app/mh-stats` | `stats.js` in each mh-* mod, `mods/mh-tabs/usage.js` |

## Usage log

- For `/herdr-usage` (skill in dots, `claude/.claude/skills/herdr-usage`), which runs `node mods/mh-tabs/usage-report.mjs`.
- `mods/mh-tabs/stats.js`, copied unchanged into each mh-* mod like `pixel.js`: `track(f, via)` adds one line with `exec` and `>>`. `trackKey(area, e, typing)` logs a dialog key, but not moves and, while a field has the keyboard, not plain text. `trackSubmit(area, e)` logs an input's enter. Nothing is logged without a window (`herdr-app check`).
- A new feature gets a `track()` at its entry point: `<mod>.<area>.<what>`. A new dialog: `track(area, "open")` in `init` and `trackKey` first in its key handler.
- No mod sees Herdr's own keys, so `mods/mh-tabs/usage.js` compares `spaces()`, layout and the sidebar every 2 s and logs the commands that explain a change (`changes()` in `usage-data.js`). Not focus moves: mh-* keys and clicks cause most of them. New and closed spaces count only on this Mac: remote ones come and go with their connection. Only the main window logs them.
- Tips: once a day, after 10 min with the window active, an INFO toast for the first entry of `mods/mh-tabs/tips.json` with no use and no tip in 7 days (`WINDOW` in `usage-data.js`). Shown tips are in `localStorage` (`tips.shown`).
- `ctrl-a u` (palette: Usage) opens the key list (`mods/mh-help`) with `{ usage: true }`: each key with its uses in the last 7 days, read again every 2 s. Unused keys are dimmed, `n/a` is a key no mod sees, `~n` is counted from state changes. Keys pressed inside a dialog are sub-rows, with the tip text from `tips.json`. Clicks, drags and dialogs no key opens are under "Without a key". The view logs itself as `mh-usage`. `usage-data.js` is copied unchanged into mh-help for this.
- Test: `node mods/mh-tabs/usage-data.test.mjs`.

## Key list (`cmd-/`, `ctrl-a ?`)

`mods/mh-help` lists every binding in `keys.json` with words from its `DESCRIBE` table. When you add or change a key, give it a line there. A key without a line shows Herdr's text and "no description". Keys inside a dialog or list (board, tasks, sessions, preview, copy mode and the rest) are not in it: `?` in that dialog shows its keys and what its marks mean (`^/` in copy mode, where `?` searches; on a search field only while it is empty). The hint line says `? keys · esc close`. `cmd-shift-/` is Herdr's raw list.

## Sidebar

One list: folders (projects), then spaces. A space is one session. Its row shows its name when someone renamed it, else its most urgent agent's `mh.description` label or title (`mods/mh-spaces/title.js`), and that agent's status. The folder `+` and `cmd-shift-c` start a space with `claude`. Each folder, Other and SSH list their spaces by recent activity: the newest `changed_at` of their tabs (an agent's state change), so there is no order by hand. `cmd-k` (`mh-sessions`) lists Spaces the same way and Open sessions by agent `seq`. `cmd-[` / `cmd-]` (`mh-tabs`) go through the agents of the spaces the sidebar shows, in its order.

## Watching (`w` or the pin on the board and in the PR panel, `ctrl-a w`)

- Add or stop with the mouse too: the pin (`watchButton()`) at the end of each board PR row and next to the PR panel's title, lit while watched.
- `mods/mh-spaces/watch.js`: a WATCHING section under the sidebar's list, outside its scroll, so it shows for every folder and space. Not in the rail. PRs only, added by hand. More than 8 rows scroll inside it. A click on the header folds it (kept in the mod's `localStorage`, `watch.folded`); folded, its chevron is yellow while a PR waits on you.
- Each row: state icon, number, title (without a `feat(x):` prefix), and whose move it is (`moveOf()` in `watch-data.js`, test: `node mods/mh-spaces/watch.test.mjs`). Your move is a chip, each with its own color and icon (`BADGE`): `CI` (red), `CHANGES` (orange, until you comment or push), `REPLY` (blue), `MERGE` (green: yours, approved, CI not running) or `REVIEW` (purple: you are asked by name; team requests do not count). Else dim: `in review`, `draft`, `queued`, `their move`. Your move comes first.
- `REPLY`: the newest comment, review or commit by another person is newer than your own last one and than your last click on the row. Bots never count (GraphQL `Bot` or a login ending in `[bot]`: Sonar, the Slack notice, Dependabot, Copilot). Not GitHub notifications: the owner can't keep up with them. A commit counts at its `committedDate` (GitHub gives no push time), so a rebase shows `REPLY` once.
- Click: the space that has the PR, else its preview; ⌘-click GitHub; both mark it seen. Right-click: snooze till the next 8:00, or stop watching. Merged and closed PRs leave the list and the `mh-watch` doc 24 h after `closedAt`.
- One GraphQL query for all watched PRs every 2 min while the window is active (`WATCH_FIELDS`). No toasts or nudges: decided against.

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

## Toasts

`mods/mh-toast` (layout `"toast"`) draws every notification. Herdr's agent toasts carry only "<program> needs you|finished" and "<space> / <tab>". The mod finds the agent from the click action (`agent.focus {terminal}`), else from that text when only one agent fits, and shows its `mh.description` or title, status, space and branch. Other toasts show a level chip (see Look).

## Git bar

The `git` block under the terminal is `mh-spaces` with props `{ bar: true }` (`mods/mh-spaces/bar.js`). It shows the shown space's branch, ahead/behind, uncommitted changes and PR badges. Branch and ahead/behind come from the sidebar copy through `shared("git.spaces")`. The bar polls the changes itself every 5 s. The branch diff compares with the base of the branch's PR (stacked branches), else with `origin/HEAD`. A mod can not import from another mod's folder, so the bar lives in `mh-spaces` to reuse `badge()` from `github.js`.

## PR panel (PR in the tab bar, `ctrl-a p`)

- The side panel's `pr` block is `mh-spaces` with props `{ pr: true }` (`mods/mh-spaces/pr.js`). It shows the shown space's PR: the branch's PR, else the space's first open PR (`spacePr()` in `github.js`). On top, the PR's status: the review word (board.js `verdict()`, with `reviewsOf()` in `github.js`), the merge state (the preview's `MERGE` words and `mergeChip()`), branch → base and size. Under it, its CI checks. No description or comments: kept simple on purpose.
- Checks are grouped by workflow, the worst group first; status contexts (no workflow) are in OTHER. A group with a failed or running check starts open, the rest folded; a click on the header toggles it. In a name like `Code Scan / x` the caller job is dimmed. A click on a check opens its log.
- It asks GitHub every 30 s, only while the panel shows PR and the window is visible. Data and the query: `checks-data.js` (no Herdr imports; the preview uses it too). Test: `node mods/mh-spaces/checks.test.mjs`.
- Keyboard: `mh-spaces` is `focusable` (mod.json), so `alt-hjkl` reaches the panel; the sidebar and git bar copies pass the focus straight back (`pane.go` right, up). `ctrl-a p` sets `shared("pr.focus")` and the panel steps `pane.go` right until it has the keyboard (Herdr has no command to focus a block). In it: `j k` rows, `l h` open or fold a workflow or go in and out, `z`/`space` toggle, `↵` log, `o`/`⌃↵` the PR on GitHub, `f` FIX, `r` refresh, `?` keys, `esc` back to the terminal it came from (also when the panel hides while it has the keyboard). FIX goes to that terminal's Claude when it is one. The `panel` node's `focus` border shows when it has the keyboard.
- FIX on a failed check sends a prompt with `hc send` to the space's Claude: the focused one, else the one that changed last. It does not focus it. With no Claude in the space, FIX is dimmed. SENT stays until the check runs again.
- Without the panel: PR badges (sidebar, git bar, link dialog) show a CI mark (red cross, yellow dot, green tick) from the sidebar's GitHub poll (every 2 min, `statusCheckRollup.state` in `PR`). The PR button's icon takes the shown space's color from `shared("pr.ci")`, which the git bar sets; it takes the panel's own answer (`shared("pr.fresh")`) when that is newer.
- Not done: auto-fix, auto-merge, a toast on a failed check, a re-run button.

## Board (`ctrl-a T`)

Choices the owner made. Do not change them without a question.

- Repos: those found in the sidebar folders, but those in `mh-board.skip` (`owner/repo`, any case), plus `mh-board.repos`. `mh-board` is in `mh-state.json`, not in dots: this repo is public and the repo names are internal. A `git@<host>:owner/repo` remote counts as GitHub (ssh host aliases).
- Repos whose `owner/repo` name contains an entry of `mh-board.hide` are hidden.
- PRs are asked for in three separate `gh` calls. One combined query gives HTTP 502.
- The PR and issue tabs are grouped by repo. There are no status groups. A stacked PR (its base is the branch of another open PR in the repo) sits under its parent with an indent (`mods/mh-spaces/stack.js`, test: `node mods/mh-spaces/stack.test.mjs`). A stack is folded under its root by default (`foldStacks()`), which shows a gray `▸ N STACKED` chip in a fixed column after the title. While folded, the root's own columns speak for the PRs it hides: a red CI cross if any fails, the `↓` if any is behind, `YOUR REVIEW` if any asks yours; the tooltips name which PRs. On any PR of the stack `l`/`→` open it, `h`/`←` fold it, `z` or a click on the chip toggles it (elsewhere `h`/`l` jump between repos). An open stack keeps the columns, with its tree marks in the title column; the open ones are kept in localStorage (`prs.open`). A search shows every match.
- When GitHub says the owner's review is requested, the review chip reads `YOUR REVIEW` (yellow). Those PRs come first in their repo.
- Each PR row, left to right: the new-activity square, `#number`, title, the `STACKED` chip column, comment count (GitHub `totalCommentsCount`), one blue dot when you have Claude sessions or links on the PR (its tooltip counts them), author, `+added -deleted`, age, the review word as a chip (`NEEDS REVIEW`, `IN REVIEW`, `APPROVED`, `CHANGES`, `DRAFT`, `QUEUED`; GitHub's `reviewDecision`, else the latest reviews; a change request shows unless GitHub says approved; `in review` when a person other than the author reviewed or commented, bots do not count), the `↓` column, and CI as a tick, cross or dot, its state in the tooltip.
- The title line is the tabs in a fixed order (Pull requests, Issues, Jira; the shown one highlighted), the refresh state and `? keys`. `?` opens a panel over the board with every key and a legend of the marks (`helpPanel()`); `?` or esc closes it. A line under the list shows only when there is a note.
- `/` opens a search field under the title line. It filters the shown tab by ref, title, repo, author, branch, assignees and labels; every word must match. `↵` keeps the filter, `esc` clears it.
- Dependabot PRs are hidden each time the mod loads. `b`, or the `Dependabot hidden N` button on the title line, shows them until the next load.
- A board session on a PR branch moves the local branch to origin: fast-forward, or after a force-push a reset when the branch has no commits or changes of its own. Otherwise it stops with an error.
- A yellow `↓` in its own column before CI marks a PR with a checkout here that does not have the PR's newest commit (new commits or a force-push). A checkout is a worktree on the PR's branch, or a `review-<number>` folder as the `review-pr` skill makes. Only repos with a space or a sidebar folder are checked.
- Not tested: worktree recreate on resume.

## Jira tab on the board (work Mac only)

- Shows when `mh-jira` is in `mh-state.json`: `{ "account": "<1Password account URL>", "vault": "...", "item": "..." }`. The item has the fields `email`, `site`, `board` and `credential` (an Atlassian API token). Without `mh-jira` there is no Jira tab.
- One Jira board only. `mods/mh-spaces/jira-data.js` sends `GET` to `/rest/agile/1.0/board/<board>/configuration` and `/rest/software/1.0/board/<board>/issue` (the `/rest/agile/1.0` issue path is deprecated), `/rest/api/3/issue/<key>` for the preview (only on `space`) and `/rest/api/3/issue/<key>/transitions` (only on `s`). The writes are `POST /rest/api/3/issue/<key>/transitions` (only on `↵` in the `s` list) and the create dialog's calls (below). Never add other Jira calls without a question.
- Cards: open issues and those done in the last 14 days (`statusCategory != Done OR resolved >= -14d`), in the board's columns side by side, in Jira's rank order. Epics (`issuetype.hierarchyLevel` 1 and up, named `Epos` in Norwegian) are left out, as the web board leaves them out. Swimlanes are not shown: the public API does not return their queries.
- A card: title, parent (epic) tag, priority word, a red `blocked` tag when an open issue blocks it (`issuelinks`), type color, key (struck through when done), assignee initials. The left edge has the priority color. A column header is red when it has more cards than the board's max.
- `h l` move between columns, `j k` between cards, `z` folds or opens a column (also a click on its header). Backlog and the columns in `mh-jira.folded` (a list of names) start folded; the choice is kept in the mod's `localStorage` (`jira.folded`), names in lower case and trimmed.
- `s` on a card or in its preview opens `mods/mh-spaces/status.js`: a dialog with the statuses Jira's workflow allows a move to, as colored chips (the current one is in the header, not in the list). It is its own dialog, so `esc` closes only it. `1`-`9` or `↵` makes a move and sets `shared("jira.moved")`: the board reloads the Jira tab and keeps the card selected, and the preview reloads. Jira's error shows in the dialog (a move with a required field, such as a resolution, fails).
- `n` opens `mods/mh-spaces/create.js`: a new Task in the board's project (`location.key` of the board configuration). Title, description (plain text, made ADF by `textToAdf` in `jira.js`), assignee No one (first) or Me, and a column (the selected one first). `tab` moves between the fields, `h l` choose on the chip rows, `⌘↵` creates. Calls: `GET /rest/api/3/myself` (only for Me, once per Herdr run), `POST /rest/api/3/issue`, `GET /rest/api/3/issue/<key>?fields=status`, and a transition when that status is not in the column. After the create, an error is a note in the dialog, so a retry makes no second issue. The type is always `Task`, by name.
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
- A `focusable` mod (mh-spaces) gets `<mod>.<command>` only in a copy that has the keyboard, so its keys go to `mh-tabs`, which hands them on with `shared("spaces.command")`.
- `tab` and `shift-tab` never reach `on_key_down`: the app binds them to focus movement. Bind them to an action of your own in a `key_context` (`cx.bind_keys` in `init`, `.key_context(...).on_action(...)` on the root), as the board and the spacing dialog do.
- `exec` never closes stdin: a program that reads stdin when it is not a terminal (`op`) waits forever. Run it as `sh -c '... </dev/null'`.
- Herdr adds `gpui-kit.d.ts` and `jsconfig.json` to mod folders. They are ignored by git.
- A popup grows with its content. A child with `flex_1().min_h(0)` gets 0 px in it, and an overlay `"height": 0` shows nothing.

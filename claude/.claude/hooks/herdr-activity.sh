#!/usr/bin/env bash
# Claude Code SessionEnd hook: removes the claude.* labels that statusline.sh set on this session's herdr-core terminal. Other events do nothing.
set -u
[ -n "${HC_TERMINAL_ID:-}" ] || exit 0
PATH="$HOME/.local/bin:$PATH:/usr/bin:/opt/homebrew/bin"

[ "$(jq -r '.hook_event_name // ""' 2>/dev/null)" = SessionEnd ] || exit 0
hc label "$HC_TERMINAL_ID" claude.context= claude.context_size= claude.session= claude.cwd= >/dev/null 2>&1
dir="$HOME/.cache/herdr-claude"
rm -rf "$dir/$HC_TERMINAL_ID.context" "$dir/$HC_TERMINAL_ID.activity" "$dir/$HC_TERMINAL_ID.activity.labels" "$dir/$HC_TERMINAL_ID.activity.lock"
exit 0

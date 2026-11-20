#!/usr/bin/env bash
# Claude Code hook: sets claude.subagents and claude.shells on this session's herdr-core terminal. It prints nothing, so PreToolUse does not answer for the tool call.
set -u
[ -n "${HC_TERMINAL_ID:-}" ] || exit 0
PATH="$HOME/.local/bin:$PATH:/usr/bin:/opt/homebrew/bin"

input=$(cat)
dir="$HOME/.cache/herdr-claude"
run="$dir/$HC_TERMINAL_ID.activity"
mkdir -p "$run"

fields=$(jq -r '
  def safe: gsub("[^A-Za-z0-9_-]"; "");
  def live: (.status // "") | test("^(completed|failed|killed|stopped|cancelled|done|error)$") | not;
  (.hook_event_name // ""),
  (.agent_id // "" | safe),
  (.tool_use_id // "" | safe),
  (.tool_input.run_in_background // false | tostring),
  (has("background_tasks") | tostring),
  ([.background_tasks[]? | select(.type == "subagent" and live)] | length | tostring),
  ([.background_tasks[]? | select(.type == "shell" and live) | .id | safe] | join(" "))
' <<<"$input" 2>/dev/null) || exit 0
{ read -r event; read -r agent; read -r tool; read -r background; read -r known; read -r agents; read -r shells; } <<<"$fields"

# One empty file per running thing keeps the count. A tool call in a subagent has agent_id too, so shells are counted by tool_use_id.
case "$event" in
SubagentStart) [ -n "$agent" ] && : >"$run/agent.$agent" ;;
SubagentStop) [ -n "$agent" ] && rm -f "$run/agent.$agent" ;;
PreToolUse) [ -n "$tool" ] && : >"$run/shell.$tool" ;;
PostToolUse | PostToolUseFailure)
  [ -n "$tool" ] && rm -f "$run/shell.$tool"
  [ "$event" = PostToolUse ] && [ "$background" = true ] && [ -n "$tool" ] && : >"$run/bg.$tool"
  ;;
Stop)
  # background_tasks corrects what an interrupt left behind. Without it, nothing is known: keep the files.
  if [ "$known" = true ]; then
    rm -f "$run"/shell.* "$run"/bg.*
    for s in $shells; do : >"$run/bg.$s"; done
    [ "$agents" = 0 ] && rm -f "$run"/agent.*
  fi
  ;;
SessionStart) rm -f "$run"/* ;;
SessionEnd)
  hc label "$HC_TERMINAL_ID" claude.context= claude.context_size= claude.session= claude.cwd= claude.subagents= claude.shells= >/dev/null 2>&1
  rm -rf "$run" "$run.labels" "$run.lock" "$dir/$HC_TERMINAL_ID.context"
  exit 0
  ;;
esac

# Hooks of parallel tool calls end at the same time: count and set the label one at a time.
tries=0
until mkdir "$run.lock" 2>/dev/null || [ "$tries" -ge 50 ]; do
  tries=$((tries + 1))
  sleep 0.02
done
trap 'rmdir "$run.lock" 2>/dev/null' EXIT

count() { ls "$run" | grep -c "^$1\."; }
subagents=$(count agent)
shells=$(($(count shell) + $(count bg)))
[ "$subagents" = 0 ] && subagents=""
[ "$shells" = 0 ] && shells=""

state="$subagents $shells"
if [ "$state" != "$(cat "$run.labels" 2>/dev/null)" ]; then
  hc label "$HC_TERMINAL_ID" "claude.subagents=$subagents" "claude.shells=$shells" >/dev/null 2>&1 &&
    printf '%s' "$state" >"$run.labels"
fi
exit 0

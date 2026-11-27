#!/usr/bin/env bash
# Claude Code hook for Herdr. Keeps the claude.running label on this session's herdr-core terminal: a JSON array of the running subagents and background shells, [{"kind":"agent"|"shell","name":..,"detail":..}], oldest first.
# PreToolUse (Agent) notes the description, SubagentStart/SubagentStop add and remove the subagent, PostToolUse (Bash in the background) adds the shell and starts a watcher that removes it when its processes exit.
# SessionEnd removes the claude.* labels that statusline.sh and this hook set.
set -u
[ -n "${HC_TERMINAL_ID:-}" ] || exit 0
PATH="$HOME/.local/bin:$PATH:/usr/bin:/opt/homebrew/bin:/usr/local/bin"

dir="$HOME/.cache/herdr-claude"
run="$dir/$HC_TERMINAL_ID.running"
input=$(cat)
event=$(jq -r '.hook_event_name // ""' <<<"$input" 2>/dev/null) || exit 0
safe() { case "$1" in "" | */* | .*) return 1 ;; esac; }

relabel() {
  # Parallel tool calls run hooks together: the lock stops an older list from overwriting a newer one.
  for _ in $(seq 50); do mkdir "$run.lock" 2>/dev/null && break; sleep 0.1; done
  local list
  list=$(ls -tr "$run"/agent-* "$run"/shell-* 2>/dev/null | xargs cat 2>/dev/null | jq -sc 'if length > 0 then . else empty end')
  hc label "$HC_TERMINAL_ID" "claude.running=$list" >/dev/null 2>&1
  rmdir "$run.lock" 2>/dev/null
}

case "$event" in
PreToolUse)
  # SubagentStart has no description: keep it here, keyed by type, for the next start of that type.
  id=$(jq -r '.tool_use_id // ""' <<<"$input")
  safe "$id" || exit 0
  mkdir -p "$run/pending"
  jq -c '{kind: "agent", type: (.tool_input.subagent_type // "general-purpose"), name: (.tool_input.description // ""), detail: (.tool_input.subagent_type // "general-purpose")}' <<<"$input" >"$run/pending/$id"
  ;;
SubagentStart)
  { read -r id; read -r type; } < <(jq -r '(.agent_id // ""), (.agent_type // "agent")' <<<"$input")
  safe "$id" || exit 0
  mkdir -p "$run/pending"
  # The oldest description of this type from the last minute; older ones were never started.
  find "$run/pending" -type f -mmin +1 -delete 2>/dev/null
  match=$(ls -tr "$run/pending" 2>/dev/null | while read -r p; do jq -e --arg t "$type" '.type == $t' "$run/pending/$p" >/dev/null 2>&1 && { echo "$p"; break; }; done)
  if [ -n "$match" ]; then
    jq -c '{kind, name: (if .name == "" then .type else .name end), detail}' "$run/pending/$match" >"$run/agent-$id" && rm -f "$run/pending/$match"
  else
    jq -nc --arg t "$type" '{kind: "agent", name: $t, detail: $t}' >"$run/agent-$id"
  fi
  relabel
  ;;
SubagentStop)
  id=$(jq -r '.agent_id // ""' <<<"$input")
  safe "$id" || exit 0
  rm -f "$run/agent-$id"
  relabel
  ;;
PostToolUse)
  { read -r task; read -r session; } < <(jq -r 'if .tool_input.run_in_background == true then (.tool_response.backgroundTaskId // "") else "" end, (.session_id // "")' <<<"$input")
  safe "$task" && safe "$session" || exit 0
  # The shell and its command hold the task's output file open while they run.
  pids=$(lsof -t /private/tmp/claude-"$(id -u)"/*/"$session"/tasks/"$task".output 2>/dev/null | tr '\n' ' ')
  [ -n "$pids" ] || exit 0
  mkdir -p "$run"
  jq -c '{kind: "shell", name: (.tool_input.description // .tool_input.command | .[0:200]), detail: (.tool_input.command | .[0:500])}' <<<"$input" >"$run/shell-$task"
  relabel
  nohup bash -c 'for p in $1; do while kill -0 "$p" 2>/dev/null; do sleep 2; done; done; rm -f "$2"; echo "{\"hook_event_name\":\"Relabel\"}" | bash "$3"' _ "$pids" "$run/shell-$task" "${BASH_SOURCE[0]}" </dev/null >/dev/null 2>&1 &
  ;;
Relabel)
  relabel
  ;;
SessionEnd)
  hc label "$HC_TERMINAL_ID" claude.context= claude.context_size= claude.session= claude.cwd= claude.running= claude.subagents= >/dev/null 2>&1
  rm -rf "$dir/$HC_TERMINAL_ID.context" "$run" "$run.lock" "$dir/$HC_TERMINAL_ID.subagents" "$dir/$HC_TERMINAL_ID.activity" "$dir/$HC_TERMINAL_ID.activity.labels" "$dir/$HC_TERMINAL_ID.activity.lock"
  ;;
esac
exit 0

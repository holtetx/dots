#!/usr/bin/env bash
# Claude Code hook: keeps Herdr's claude.running label (format: AGENTS.local.md in herdr-app) and clears the claude.* labels at SessionEnd.
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
  # SubagentStart has no description: keep it for the next start of this type.
  { read -r id; read -r type; IFS= read -r desc; } < <(jq -r '(.tool_use_id // ""), (.tool_input.subagent_type // "general-purpose"), (.tool_input.description // "" | gsub("\n"; " "))' <<<"$input")
  safe "$id" && safe "$type" || exit 0
  mkdir -p "$run/pending"
  printf '%s' "$desc" >"$run/pending/$type--$id"
  ;;
SubagentStart)
  { read -r id; read -r type; IFS= read -r transcript; } < <(jq -r '(.agent_id // ""), (.agent_type // "agent"), (.transcript_path // "")' <<<"$input")
  safe "$id" || exit 0
  mkdir -p "$run/pending"
  find "$run/pending" -type f -mmin +1 -delete 2>/dev/null
  # The oldest description of this type. mv is atomic, so of starts that run together each claims a different one.
  name=""
  for p in $(ls -tr "$run/pending"); do
    case "$p" in "$type"--*) mv "$run/pending/$p" "$run/claim-$id" 2>/dev/null && name=$(cat "$run/claim-$id") && rm -f "$run/claim-$id" && break ;; esac
  done
  jq -nc --arg n "${name:-$type}" --arg t "$type" --arg f "${transcript%.jsonl}/subagents/agent-$id.jsonl" '{kind: "agent", name: $n, detail: $t, file: $f}' >"$run/agent-$id"
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
  out=$(ls /private/tmp/claude-"$(id -u)"/*/"$session"/tasks/"$task".output 2>/dev/null | head -1)
  pids=$([ -n "$out" ] && lsof -t "$out" 2>/dev/null | tr '\n' ' ')
  [ -n "$pids" ] || exit 0
  # `cmd > log` leaves the task output empty: follow the last stdout redirect's file instead.
  # ponytail: regex, not a shell parser; quoted paths or `tee` aren't followed.
  { read -r cmd; read -r cwd; } < <(jq -r '(.tool_input.command // "" | gsub("\n"; " ")), (.cwd // "")' <<<"$input")
  log=$(grep -oE '(^|[^0-9])&?>>? *[^ &|;<>]+' <<<"$cmd" | tail -1 | sed -E 's/^[^>]*>+ *//')
  case "$log" in "~/"*) log="$HOME/${log#\~/}" ;; /*) ;; ?*) log="$cwd/$log" ;; esac
  [ -n "$log" ] && [ -f "$log" ] && out=$log
  mkdir -p "$run"
  jq -c --arg f "$out"'{kind: "shell", name: (.tool_input.description // .tool_input.command | .[0:200]), detail: (.tool_input.command | .[0:500]), file: $f}' <<<"$input" >"$run/shell-$task"
  relabel
  nohup bash -c 'for p in $1; do while kill -0 "$p" 2>/dev/null; do sleep 2; done; done; rm -f "$2"; echo "{\"hook_event_name\":\"Relabel\"}" | bash "$3"' _ "$pids" "$run/shell-$task" "${BASH_SOURCE[0]}" </dev/null >/dev/null 2>&1 &
  ;;
Relabel)
  relabel
  ;;
SessionEnd)
  hc label "$HC_TERMINAL_ID" claude.context= claude.context_size= claude.session= claude.cwd= claude.running= >/dev/null 2>&1
  rm -rf "$dir/$HC_TERMINAL_ID.context" "$run" "$run.lock"
  ;;
esac
exit 0

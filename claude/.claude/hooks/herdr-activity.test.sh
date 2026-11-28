#!/usr/bin/env bash
# Run: bash claude/.claude/hooks/herdr-activity.test.sh
# Feeds herdr-activity.sh a background Bash call and a subagent start, with stub hc and lsof,
# and checks the claude.running label it sets has the fields the sidebar draws.
set -eu
hook="$(cd "$(dirname "$0")" && pwd)/herdr-activity.sh"
tmp=$(mktemp -d)
# The hook looks for the task output under /private/tmp/claude-<uid>/*/<session>/tasks.
session="herdr-hook-test-$$"
tasks="/private/tmp/claude-$(id -u)/$session-project/$session/tasks"
sleep 30 & busy=$!; disown
trap 'kill $busy 2>/dev/null; rm -rf "$tmp" "/private/tmp/claude-$(id -u)/$session-project"' EXIT

# The hook puts $HOME/.local/bin first on PATH: the stubs go there. The terminal id is fake, so the
# hook's watcher, which outlives the stubs and then finds the real hc, changes no real terminal.
mkdir -p "$tmp/.local/bin" "$tasks"
touch "$tasks/t1.output"
printf '#!/bin/sh\nprintf "%%s\\n" "$@" >"%s/hc.args"\n' "$tmp" >"$tmp/.local/bin/hc"
printf '#!/bin/sh\necho %s\n' "$busy" >"$tmp/.local/bin/lsof"
chmod +x "$tmp/.local/bin/"*

run() { HOME="$tmp" HC_TERMINAL_ID="$session" bash "$hook"; }
label() { sed -n 's/^claude\.running=//p' "$tmp/hc.args"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

jq -nc --arg s "$session" '{hook_event_name: "PostToolUse", session_id: $s, cwd: "/", tool_input: {command: "sleep 30", description: "Wait a bit", run_in_background: true}, tool_response: {backgroundTaskId: "t1"}}' | run
want=$(jq -nc --arg f "$tasks/t1.output" '[{kind: "shell", name: "Wait a bit", detail: "sleep 30", file: $f}]')
[ "$(label)" = "$want" ] || fail "shell label: $(label)"

jq -nc '{hook_event_name: "PreToolUse", tool_use_id: "u1", tool_input: {subagent_type: "Explore", description: "Find the hook"}}' | run
jq -nc '{hook_event_name: "SubagentStart", agent_id: "a1", agent_type: "Explore", transcript_path: "/x/s.jsonl"}' | run
jq -e 'length == 2 and (.[1] | .kind == "agent" and .name == "Find the hook" and .detail == "Explore" and .file == "/x/s/subagents/agent-a1.jsonl")' <<<"$(label)" >/dev/null || fail "agent label: $(label)"
echo ok

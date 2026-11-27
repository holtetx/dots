#!/usr/bin/env bash
# Adds the Herdr status line and hooks to ~/.claude/settings.json (not in dots). Safe to run again: it replaces its own entries and keeps all others.
set -euo pipefail
settings="$HOME/.claude/settings.json"
[ -f "$settings" ] || echo '{}' >"$settings"

line='f="$HOME/.claude/hooks/statusline.sh"; [ -f "$f" ] && bash "$f"; true'
activity='f="$HOME/.claude/hooks/herdr-activity.sh"; [ -f "$f" ] && bash "$f"; true'

jq --arg line "$line" --arg h "$activity" '
  def hook($m): [{hooks: [{type: "command", command: $h, timeout: 10}]} + (if $m then {matcher: $m} else {} end)];
  def add($e; $m): .hooks[$e] = (((.hooks[$e] // []) | map(.hooks |= map(select(.command != $h))) | map(select(.hooks | length > 0))) + hook($m));
  .statusLine = {type: "command", command: $line}
  | add("SessionEnd"; null) | add("SubagentStart"; null) | add("SubagentStop"; null)
  | add("PreToolUse"; "Agent|Task") | add("PostToolUse"; "Bash")
' "$settings" >"$settings.new"
cp "$settings" "$settings.bak"
mv "$settings.new" "$settings"
echo "Updated $settings (old copy: $settings.bak). Restart running Claude sessions."

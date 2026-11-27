#!/bin/sh
# Follows a Claude Code subagent's transcript (.jsonl, shown as text, tool calls and results) or a background shell's output file.
PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
case "$1" in
*.jsonl)
  tail -n +1 -F "$1" 2>/dev/null | jq -Rr --unbuffered '
    def dim: "\u001b[2m" + . + "\u001b[0m";
    def short($n): gsub("\\s+"; " ") | if length > $n then .[0:$n] + "…" else . end;
    fromjson? |
    if .type == "assistant" then
      .message.content[]? |
      if .type == "text" then "\n" + .text + "\n"
      elif .type == "tool_use" then "\u001b[36m●\u001b[0m " + .name + " " + ((.input.description // .input.command // .input.pattern // .input.file_path // .input.url // .input | tostring) | short(160) | dim)
      else empty end
    elif .type == "user" then
      .message.content |
      if type == "string" then
        if startswith("<") or startswith("[SYSTEM") then empty else "\u001b[1m> " + . + "\u001b[0m\n" end
      else
        .[]? | select(.type == "tool_result") | "  ⎿ " + ((.content | if type == "array" then map(.text // "") | join(" ") else tostring end) | short(160)) | dim
      end
    else empty end'
  ;;
*) tail -n +1 -F "$1" ;;
esac

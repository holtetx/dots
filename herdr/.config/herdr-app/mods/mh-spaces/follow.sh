#!/usr/bin/env bash
# Shows a subagent's transcript ($1, .jsonl) or a background shell's output ($1) live, until its entry leaves terminal $2's claude.running label.
PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
file=$1 owner=$2

running() { hc get "$owner" --json 2>/dev/null | jq -e --arg f "$file" '.labels["claude.running"] // "[]" | fromjson | any(.file == $f)' >/dev/null 2>&1; }

# A fifo, so the tail's pid is known and it can be stopped (macOS tail has no --pid).
fifo=$(mktemp -u "${TMPDIR:-/tmp}/herdr-follow.XXXXXX") && mkfifo "$fifo" || exit 1
trap 'rm -f "$fifo"; kill "$tailer" 2>/dev/null' EXIT
tail -n +1 -F "$file" 2>/dev/null >"$fifo" &
tailer=$!
case "$file" in
*.jsonl)
  jq -Rr --unbuffered '
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
    else empty end' <"$fifo" &
  ;;
*) cat <"$fifo" & ;;
esac
viewer=$!

sleep 1
while running; do sleep 2; done
sleep 1
kill "$tailer" 2>/dev/null
wait "$tailer" 2>/dev/null
wait "$viewer"
printf '\n\033[2m[finished] Enter closes this view.\033[0m\n'
read -r -t 600 _

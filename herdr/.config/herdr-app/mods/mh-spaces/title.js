// What a space's row is called when nobody named it: its lead agent's own title.

// Drops what an agent puts before its title: a status glyph or spinner and the separator
// after it ("✦  Working", "⠋ - Thinking"), and Codex's blinking "[ ! ] " / "[ . ] " mark.
// Stops at an opening bracket or quote, so a title that starts with one ("[web] login") keeps it,
// and at an emoji ("🔴 login", "❤️ deploy"), except for known status marks.
const clean = (s) => (s ?? "").replace(/^(?:\[ [!.] \] |[✋⏳]️?(?=\s)|(?!(?:\p{Emoji}️|[#*]⃣))[^\p{L}\p{N}\p{Ps}\p{Pi}\p{Emoji_Presentation}])+/u, "").trim();

// The agent's title when it says more than the program, a path or user@host.
export function telling(a) {
  const live = clean(a?.title);
  // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test((a?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  return live && live !== a?.address && live !== a?.program?.name && !path && !live.includes("@") && live.toLowerCase() !== a?.program?.key ? live : null;
}

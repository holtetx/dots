// Usage log for the /herdr-usage review. Each mh-* mod that logs has an identical copy of this file (mods can't import each other).
import { exec, home, window } from "herdr";

export const LOG_DIR = () => `${home()}/.config/herdr-app/mh-stats`;

// f: "<mod>.<area>.<what>" for mh-* features, else a Herdr command name. One file a day: see logFiles in usage-data.js.
export function track(f, via) {
  if (!window()) return; // herdr-app check
  const t = new Date().toISOString();
  const line = JSON.stringify({ t, f, via });
  exec("sh", ["-c", 'mkdir -p "$1" && printf "%s\\n" "$2" >> "$1/$3"', "sh", LOG_DIR(), line, `${t.slice(0, 10)}.jsonl`]).catch(() => {});
}

// Dialog keys as "<area>.<mods>-<key>". Moves and key repeat are noise; while a field has the keyboard, so is text (⌥ types characters).
export function trackKey(area, e, typing) {
  const k = keyName(e, typing);
  if (k) track(`${area}.${k}`, "key");
}

// An input's submit: enter, shift-enter or cmd-enter. Typing dialogs see enter only here.
export function trackSubmit(area, e) {
  track(`${area}.${e?.secondary ? "cmd-enter" : e?.shift ? "shift-enter" : "enter"}`, "key");
}

const MOVES = new Set(["up", "down", "left", "right", "j", "k", "shift", "control", "alt", "platform"]);
const EDITS = new Set(["backspace", "delete", "space"]);

export function keyName(e, typing) {
  const m = e.modifiers;
  const chord = m.control || m.alt || m.platform;
  if (e.is_held) return null;
  if (typing && (e.key === "enter" || (m.alt && !m.control && !m.platform))) return null;
  if (m.control && !m.alt && !m.platform && ["j", "k", "n", "p"].includes(e.key)) return null;
  if (!chord && e.key !== "?" && (MOVES.has(e.key) || (typing && (e.key.length === 1 || EDITS.has(e.key))))) return null;
  return [m.control && "ctrl", m.alt && "alt", m.platform && "cmd", m.shift && "shift", e.key].filter(Boolean).join("-");
}

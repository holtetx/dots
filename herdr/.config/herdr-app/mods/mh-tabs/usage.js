import { spaces, shared, layout, notify, window, home, appHome, readTextFile } from "herdr";
import { track, LOG_DIR } from "./stats.js";
import { changes, find, logFiles, nextTip, parseLog, snapshot } from "./usage-data.js";

export function watchUsage(cx) {
  // Other windows (new-window.sh) see the same spaces: count them once.
  if (appHome() !== `${home()}/.config/herdr-app`) return;
  let last = null;
  cx.timer.every(2000, () => {
    const now = snapshot(spaces(), shared("layout"), !find(layout(), "sidebar")?.hidden);
    if (last) for (const f of changes(last, now)) track(f, "state");
    last = now;
  });
  cx.timer.every(10 * 60 * 1000, (cx) => window()?.active && cx.spawn(() => tip().catch(() => {})));
}

async function tip() {
  const today = new Date().toISOString().slice(0, 10);
  let shown;
  try { shown = JSON.parse(localStorage.getItem("tips.shown") ?? "{}"); } catch { shown = {}; }
  if (Object.values(shown).includes(today)) return;
  const tips = JSON.parse(await readTextFile(`${appHome()}/mods/mh-tabs/tips.json`) ?? "[]");
  const texts = await Promise.all(logFiles(Date.now()).map((f) => readTextFile(`${LOG_DIR()}/${f}`).catch(() => null)));
  const pick = nextTip(tips, parseLog(texts.join("\n")), shown, Date.now());
  if (!pick) return;
  shown[pick.f] = today;
  try { localStorage.setItem("tips.shown", JSON.stringify(shown)); } catch {}
  notify({ title: "Did you know?", body: `${pick.key}: ${pick.text}`, level: "info", timeout: 20000 });
  track(pick.f, "tip");
}

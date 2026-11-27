// The spacing dialog's Board tab: the board's repos, from sidebar folders (off: `skip`) and added here (`repos`), kept as shared("mh-board").

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { shared, setShared } from "herdr";
import { button, frame } from "./pixel.js";

const KEY = "mh-board";
const DEFAULTS = { repos: [], skip: [] };
const value = () => ({ ...DEFAULTS, ...(shared(KEY) ?? {}) });
const lower = (list) => new Set(list.map((r) => r.toLowerCase()));

function save(change) {
  const next = change(value());
  setShared(KEY, Object.fromEntries(Object.entries(next).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(DEFAULTS[k]))));
}

// "owner/repo" from what's typed: owner/repo, or a GitHub URL or remote.
function repoOf(text) {
  const s = text.trim();
  const m = s.match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?].*)?$/) ?? s.match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

function rows() {
  const cfg = value();
  const found = shared("board.repos") ?? [];
  const auto = lower(found);
  const added = lower(cfg.repos);
  const skip = lower(cfg.skip);
  const all = new Map([...found, ...cfg.repos].map((r) => [r.toLowerCase(), r]));
  return [...all.values()]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((repo) => {
      const k = repo.toLowerCase();
      return { kind: "repo", id: repo, label: repo, about: auto.has(k) ? "sidebar folder" : "added", auto: auto.has(k), on: added.has(k) || (auto.has(k) && !skip.has(k)) };
    });
}

function toggle(row) {
  const k = row.id.toLowerCase();
  save((c) => {
    const repos = c.repos.filter((r) => r.toLowerCase() !== k);
    const skip = c.skip.filter((r) => r.toLowerCase() !== k);
    return row.on ? { ...c, repos, skip: row.auto ? [...skip, row.id] : skip } : { ...c, repos: row.auto ? repos : [...repos, row.id], skip };
  });
}

export function boardTabInit(view) {
  view.board = 0;
  view.addError = "";
  view.addRepo = InputState.new({ placeholder: "Add a repo: owner/repo or a GitHub URL" });
  view.addRepo.on("focus", (_e, cx) => { view.editing = "add-repo"; cx.notify(); });
  view.addRepo.on("blur", (_e, cx) => { if (!view.help) view.editing = null; cx.notify(); });
  view.addRepo.on("change", (_e, cx) => { view.addError = ""; cx.notify(); });
  view.addRepo.on("submit", (_e, cx) => {
    const repo = repoOf(view.addRepo.value());
    if (!repo) view.addError = "That isn't owner/repo or a GitHub URL.";
    else {
      const k = repo.toLowerCase();
      save((c) => ({ ...c, repos: [...c.repos.filter((r) => r.toLowerCase() !== k), repo], skip: c.skip.filter((r) => r.toLowerCase() !== k) }));
      view.addRepo.set_value("");
      view.handle.focus();
    }
    cx.notify();
  });
}

export function boardKey(view, e) {
  const list = rows();
  const n = list.length;
  if (e.key === "a") view.addRepo.focus();
  else if (!n) return false;
  else if (e.key === "up" || e.key === "k") view.board = (view.board + n - 1) % n;
  else if (e.key === "down" || e.key === "j") view.board = (view.board + 1) % n;
  else if (e.key === "space" || e.key === "enter") toggle(list[Math.min(view.board, n - 1)]);
  else return false;
  return true;
}

export const check = (t, on) => button(div(), t, on).size(16).flex_none().flex().items_center().justify_center()
  .when(on, (el) => el.border_color(t.accent).bg(t.accent).text_color(t.accent_foreground).child(svg("mods/workspace-chrome/check.svg").size(10)));

export function boardTab(view, t) {
  const list = rows();
  view.board = Math.max(0, Math.min(view.board, list.length - 1));
  const row = (r, i) => h_flex()
    .id(`board-${r.kind}-${r.id}`)
    .h(30)
    .px(8)
    .gap(10)
    .flex_none()
    .items_center()
    .rounded(6)
    .cursor_pointer()
    .when(i === view.board, (el) => el.bg(t.selected))
    .when(i !== view.board, (el) => el.hover((s) => s.bg(t.hover)))
    .on_click((_e, cx) => { view.board = i; toggle(r); cx.notify(); })
    .child(check(t, r.on))
    .child(div().flex_1().min_w(0).truncate().text_color(r.on ? t.foreground : t.muted).child(r.label))
    .child(div().flex_none().text_size(11.5).text_color(t.dim).child(r.about));
  const section = (label) => div().px(8).pt(8).pb(2).flex_none().text_size(11).font_semibold().text_color(t.dim).child(label);
  const children = [section("REPOS: THEIR OPEN PRs AND ISSUES")];
  children.push(h_flex().px(8).py(2).flex_none()
    .child(frame(Input.new(view.addRepo), view.editing === "add-repo" ? t.accent : t.input, t.background).flex_1().min_w(0).h(28).px(10).items_center().text_color(t.foreground)));
  if (view.addError) children.push(div().px(8).flex_none().text_size(11.5).text_color(t.blocked).child(view.addError));
  list.forEach((r, i) => children.push(row(r, i)));
  return {
    body: v_flex().id("board-list").flex_1().min_h(0).gap(2).overflow_y_scrollbar().children(children),
    // hide has no row here, so a reset keeps it.
    reset: Object.keys(shared(KEY) ?? {}).some((k) => k !== "hide") ? () => setShared(KEY, shared(KEY).hide ? { hide: shared(KEY).hide } : {}) : null,
  };
}

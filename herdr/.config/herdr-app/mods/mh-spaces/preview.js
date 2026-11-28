import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle, TextView } from "gpui-base";
import { props, closeOverlay, theme, shared } from "herdr";
import { GH, FINAL, open, stateMarks } from "./github.js";
import { ago, avatar, colorOf, epic, openStatus, pick, statusChip, statusLegend } from "./board.js";
import { REVIEW_WORD, canCache, cacheImage, fetchPreview, loadAvatars, pruneCache } from "./preview-data.js";
import { fetchJiraPreview } from "./jira-data.js";
import { countLine } from "./checks-data.js";
import { GREEN, PRIORITY_COLOR, RED, TYPE_COLOR, YELLOW, hue } from "./jira.js";
import { chip, darkOf, helpKey, keyPanel } from "./pixel.js";
import { track, trackKey } from "./stats.js";

const CHECK_COLOR = { failed: RED, running: YELLOW, passed: GREEN };
const REVIEW_COLOR = { APPROVED: GREEN, CHANGES_REQUESTED: RED };
const MERGE_COLOR = { conflicts: RED, "checks failing": RED, "ready to merge": GREEN };
export const mergeChip = (word, t, dark) => chip(word, MERGE_COLOR[word.toLowerCase()] ? pick(MERGE_COLOR[word.toLowerCase()], dark) : t.ansi3);
// The last answer per URL: shown at once on the next opening while it asks again.
const memory = {};

export function previewInit(view, cx) {
  view.handle = cx.focus_handle();
  view.handle.focus();
  view.scroll = ScrollHandle.new();
  view.url = props().preview;
  view.trail = [];
  view.images = {};
  pruneCache();
  load(view, cx);
  // The status list over it (s) gives the keyboard back when it closes, and a move reloads it.
  view.focusAsk = shared("preview.focus");
  view.moveSeen = shared("jira.moved")?.at;
  cx.timer.every(150, (cx) => {
    const moved = shared("jira.moved");
    if (moved && moved.at !== view.moveSeen) {
      view.moveSeen = moved.at;
      if (moved.url === view.url) load(view, cx, view.at);
    }
    if (shared("preview.focus") === view.focusAsk) return;
    view.focusAsk = shared("preview.focus");
    view.handle.focus();
  });
}

// at: the block to select, for ^O back to where ↵ left.
function load(view, cx, at = 0) {
  const url = view.url;
  view.at = at;
  view.moved = at > 0;
  view.scroll.scroll_to_item(at);
  view.busy = true;
  view.error = "";
  cx.spawn(async (cx) => {
    try {
      const jira = url.match(/\/browse\/([^/?#]+)$/)?.[1];
      memory[url] = await (jira ? fetchJiraPreview(jira) : fetchPreview(url));
    } catch (e) {
      view.error = String(e?.message ?? e);
    }
    view.busy = false;
    cx.notify();
    const d = memory[url];
    if (d?.jira) {
      await loadAvatars([d.assigneeAvatar, d.reporterAvatar, ...d.posts.map((p) => p.avatar)]);
      cx.notify();
    }
    const parts = d ? [...d.body, ...d.posts.flatMap((p) => [...p.parts, ...(p.replies ?? []).flatMap((r) => r.parts)])] : [];
    await Promise.all(parts.filter((p) => p.img && canCache(p.img)).map(async (p) => {
      view.images[p.img] = await cacheImage(p.img);
      cx.notify();
    }));
  });
}

function go(view, i) {
  view.moved = true;
  view.at = Math.max(0, Math.min((view.blocks?.length ?? 1) - 1, i));
  view.scroll.scroll_to_item(view.at);
}

function key(view, e, cx) {
  const m = e.modifiers;
  trackKey("mh-spaces.preview", e, false);
  if (helpKey(view, e)) return true;
  const linked = view.blocks?.[view.at]?.preview;
  // ↵ previews a linked Jira issue, ^O goes back, as vim's jump list does.
  if (e.key === "enter" && !m.control && !m.alt && !m.platform && linked) return view.trail.push({ url: view.url, at: view.at }), (view.url = linked), load(view, cx), true;
  if (e.key === "o" && m.control && view.trail.length) {
    const back = view.trail.pop();
    view.url = back.url;
    return load(view, cx, back.at), true;
  }
  if (e.key === "escape" || e.key === "space") return closeOverlay(props().overlay), true;
  if (e.key === "enter" && m.control) return open(view.blocks?.[view.at]?.url ?? view.url, cx), true;
  if (m.control && (e.key === "d" || e.key === "u")) return go(view, view.at + (e.key === "d" ? 3 : -3)), true;
  if (m.control || m.alt || m.platform) return false;
  if (e.key === "j" || e.key === "down") return go(view, view.at + 1), true;
  if (e.key === "k" || e.key === "up") return go(view, view.at - 1), true;
  if (e.key === "g" || e.key === "G") return go(view, m.shift || e.key === "G" ? Infinity : 0), true;
  if (e.key === "r") return load(view, cx), true;
  const d = memory[view.url];
  if (e.key === "s" && d?.jira) return openStatus({ ...d, key: d.ref, url: view.url }, "preview.focus"), true;
  return false;
}

const md = (id, text) => TextView.markdown(id, text).selectable(true).on_link_click((url, cx) => open(url, cx));

function parts(id, list, view, t) {
  return v_flex().gap(6).children(list.map((p, i) => {
    if (p.md) return md(`${id}-${i}`, p.md);
    const got = p.img && view.images[p.img];
    if (got) {
      const scale = Math.min(1, 900 / got.w, 320 / got.h);
      return div().id(`${id}-${i}`).cursor_pointer().on_click((_e, cx) => open(p.link, cx)).child(image(got.path).w(got.w * scale).h(got.h * scale));
    }
    const loading = p.img && canCache(p.img) && view.images[p.img] === undefined;
    return div().id(`${id}-${i}`).text_size(12).text_color(t.accent).cursor_pointer().on_click((_e, cx) => open(p.link ?? p.video, cx))
      .child(p.video ? "Video: opens in the browser" : loading ? "Image: loading" : "Image: opens in the browser");
  }));
}

function entry(name, value, t) {
  return h_flex().gap(12).items_start().min_h(24)
    .child(div().w(64).flex_none().pt(3).text_size(11.5).text_color(t.dim).child(name))
    .child(div().flex_1().min_w(0).flex().items_center().min_h(22).child(value));
}

const person = (name, url, t) => h_flex().gap(8).items_center().min_w(0).child(avatar(name, t, 22, url)).child(div().min_w(0).truncate().text_color(name ? t.foreground : t.muted).child(name || "Unassigned"));

// One row per linked issue; the link word only on the first of its group.
function linkRow(l, first, t, dark) {
  const done = l.statusCategory === "done";
  return h_flex().h(30).gap(10).items_center()
    .child(div().w(120).flex_none().truncate().text_size(11.5).text_color(l.blocker && !done ? pick(RED, dark) : t.dim).child(first ? l.why : ""))
    .child(div().size(8).flex_none().rounded(2).bg(colorOf(TYPE_COLOR, l.type, dark, t)))
    .child(div().w(80).flex_none().truncate().text_size(11.5).text_color(t.dim).when(done, (el) => el.line_through()).child(l.key))
    .child(div().flex_1().min_w(0).truncate().text_color(done ? t.muted : t.foreground).child(l.title))
    .child(statusChip(l.status, l.statusCategory, t, dark));
}

function jiraDetails(d, t, dark) {
  const priority = colorOf(PRIORITY_COLOR, d.priority, dark, t);
  return v_flex().w(310).flex_none().self_start().px(16).py(14).gap(8).rounded(6).bg(t.surface).text_size(12.5)
    .child(entry("Status", statusChip(d.status, d.statusCategory, t, dark), t))
    .child(entry("Assignee", person(d.assignee, d.assigneeAvatar, t), t))
    .child(entry("Reporter", person(d.reporter, d.reporterAvatar, t), t))
    .child(entry("Priority", h_flex().gap(8).items_center().child(div().size(8).rounded(2).bg(priority)).child(div().text_color(t.foreground).child(d.priority || "None")), t))
    .when(Boolean(d.parent), (el) => el.child(entry("Parent", h_flex().min_w(0).child(epic(d.parent?.title ?? "", hue(d.parent?.key ?? "", t), t)), t)))
    .when(d.labels.length > 0, (el) => el.child(entry("Labels", h_flex().gap(4).flex_wrap().children(d.labels.map((l) => chip(l, t.muted))), t)))
    .child(div().my(4).h(1).bg(t.border))
    .child(entry("Created", div().text_color(t.muted).child(`${ago(d.created)} ago`), t))
    .child(entry("Updated", div().text_color(t.muted).child(`${ago(d.updated)} ago`), t));
}

// The left side's blocks, which j k move through: description pieces, linked issues, comments.
function jiraBlocks(view, d, t, dark) {
  const label = (text, n) => h_flex().gap(6).items_center().pb(2).text_size(11).font_semibold().text_color(t.muted).child(text)
    .when(n != null, (el) => el.child(div().font_normal().text_color(t.dim).child(String(n))));
  // Grouped by how they're linked, blockers first; each row its own block so j k reach it.
  const links = [...d.links].sort((a, b) => b.blocker - a.blocker || a.why.localeCompare(b.why));
  const body = d.body.length ? d.body : [{ md: "" }];
  view.blocks = [
    ...body.map((b, i) => ({ url: d.url, el: v_flex().gap(10)
      .when(i === 0, (el) => el.child(label("DESCRIPTION")))
      .child(b.md ? md(`pv-body-${i}`, b.md) : div().text_color(t.dim).child("No description.")) })),
    ...links.map((l, i) => ({ url: l.url, preview: l.url, tight: true, start: i === 0, el: v_flex().gap(6)
      .when(i === 0, (el) => el.child(label("LINKED ISSUES", links.length)))
      .child(linkRow(l, l.why !== links[i - 1]?.why, t, dark)) })),
    ...d.posts.map((p, i) => ({ url: p.url, start: i === 0, el: v_flex().gap(8)
      .when(i === 0, (el) => el.child(label("COMMENTS", d.posts.length)))
      .child(h_flex().gap(8).items_center().child(avatar(p.who, t, 24, p.avatar)).child(div().text_size(12.5).font_semibold().text_color(t.foreground).child(p.who)).child(div().text_size(11.5).text_color(t.dim).child(`${ago(p.at)} ago`)))
      .child(div().pl(32).child(md(`pv-post-${i}`, p.parts[0].md || "_Empty._"))) })),
  ];
}

// Jira: title on top, the blocks on the left, the fields on the right, as Jira shows an issue.
function jiraRender(view, d, t, dark, footer) {
  // The selected block shows only once j k have moved, so the view opens quiet.
  const ring = (i) => (view.moved && i === view.at ? t.accent : "#00000000");
  return v_flex().size_full().min_h(0).gap(18)
    .child(v_flex().flex_none().gap(8)
      .child(h_flex().gap(8).items_center().text_size(12).text_color(t.muted)
        .child(div().size(10).rounded(2).bg(colorOf(TYPE_COLOR, d.type, dark, t)))
        .child(div().child(d.type))
        .child(div().text_color(t.border).child("/"))
        .child(div().child(d.ref)))
      .child(div().text_size(22).font_semibold().text_color(t.foreground).child(d.title)))
    .child(h_flex().flex_1().min_h(0).gap(28).items_start()
      .child(v_flex().id("pv-list").flex_1().min_w(0).h_full().overflow_y_scrollbar().track_scroll(view.scroll).text_size(13.5)
        .children(view.blocks.map((b, i) => v_flex().id(`pv-block-${i}`).when(Boolean(b.start), (el) => el.mt(18).pt(16).border_t_1().border_color(t.border))
          .child(v_flex().py(b.tight ? 0 : 8).pl(12).pr(8).rounded(6).border_l_2().border_color(ring(i))
            .when(!b.tight && !b.start && i > 0, (el) => el.mt(10))
            .on_click((_e, cx) => { view.at = i; view.moved = true; cx.notify(); })
            .child(b.el)))))
      .child(jiraDetails(d, t, dark)))
    .child(footer);
}

function header(d, view, t, dark) {
  const s = GH[d.state];
  const live = !FINAL.has(d.state);
  const tags = [
    ...(live && d.merge ? [mergeChip(d.merge, t, dark)] : []),
    ...(props().behind && view.url === props().preview ? [chip("behind", t.ansi3)] : []),
    ...d.labels.map((l) => chip(l, t.dim)),
  ];
  return v_flex().gap(6)
    .child(h_flex().gap(8).items_center().text_size(11.5)
      .child(svg(s.icon).size(14).text_color(pick(s.color, dark)))
      .child(div().text_color(pick(s.color, dark)).child(s.label))
      .child(div().text_color(t.dim).child(d.ref)))
    .child(div().text_size(16).font_semibold().text_color(t.foreground).child(d.title))
    .child(div().text_size(11.5).text_color(t.dim).child([`${d.author}, ${ago(d.created)} ago`, d.branch, d.size, d.people.length && `assigned: ${d.people.join(", ")}`].filter(Boolean).join(" · ")))
    .when(tags.length > 0, (el) => el.child(h_flex().gap(6).flex_wrap().children(tags)))
    .children(d.linked.map((l) => h_flex().id(`pv-link-${l.url}`).gap(6).text_size(12).cursor_pointer()
      .on_click((_e, cx) => { track("mh-spaces.preview.linked-click", "click"); view.url = l.url; load(view, cx); })
      .child(div().text_color(t.dim).child(d.pr ? "Closes" : "Closed by"))
      .child(div().text_color(t.accent).child(`#${l.number} ${l.title}`))));
}

function status(d, t, dark) {
  const sum = countLine(d.checks);
  return v_flex().gap(6)
    .child(h_flex().gap(10).flex_wrap().text_size(12)
      .child(div().font_semibold().text_color(t.dim).child("REVIEWS"))
      .children(d.reviewers.length
        ? d.reviewers.map((r) => div().text_color(REVIEW_COLOR[r.state] ? pick(REVIEW_COLOR[r.state], dark) : t.foreground).child(`${r.who} ${REVIEW_WORD[r.state] ?? r.state.toLowerCase()}`))
        : [div().text_color(t.muted).child("none yet")]))
    .child(h_flex().gap(10).text_size(12).child(div().font_semibold().text_color(t.dim).child("CI")).child(div().text_color(t.foreground).child(sum || "no checks")))
    .children(d.checks.filter((c) => c.state === "failed" || c.state === "running").map((c) => h_flex().id(`pv-check-${c.name}-${c.url}`).gap(8).pl(22).text_size(12).cursor_pointer()
      .on_click((_e, cx) => open(c.url, cx))
      .child(div().w(60).flex_none().text_color(pick(CHECK_COLOR[c.state], dark)).child(c.state))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(c.name))));
}

function post(p, i, view, t) {
  const who = (name, what) => h_flex().gap(8).text_size(11.5).child(div().font_medium().text_color(t.foreground).child(name)).child(div().text_color(t.dim).child(what));
  return v_flex().gap(6).when(Boolean(p.bot), (el) => el.opacity(0.5))
    .child(who(p.who, `${p.what}, ${ago(p.at)} ago`))
    .child(parts(`pv-post-${i}`, p.parts, view, t))
    .children((p.replies ?? []).map((r, j) => v_flex().gap(4).pl(12).border_l_1().border_color(t.border)
      .child(who(r.who, "replied"))
      .child(parts(`pv-post-${i}-${j}`, r.parts, view, t))));
}

export function previewRender(view) {
  const t = theme();
  const dark = darkOf(t);
  const d = memory[view.url];
  if (d?.jira) jiraBlocks(view, d, t, dark);
  else view.blocks = d
    ? [
        { url: d.url, el: header(d, view, t, dark) },
        ...(d.pr ? [{ url: `${d.url}/checks`, el: status(d, t, dark) }] : []),
        { url: d.url, el: parts("pv-body", d.body, view, t) },
        ...d.posts.map((p, i) => ({ url: p.url, el: post(p, i, view, t) })),
      ]
    : [];
  const note = view.busy ? "loading" : view.error;
  const footer = h_flex().flex_none().gap(12).items_center().text_size(11).text_color(t.dim)
    .child(div().flex_1().min_w(0).truncate().text_color(view.error ? t.blocked : t.dim).child(d ? note : ""))
    .child(div().flex_none().child("? keys · esc close"));
  const root = v_flex()
    .id("preview")
    .track_focus(view.handle)
    .on_key_down((e, cx) => {
      if (!key(view, e, cx)) return;
      cx.stop_propagation();
      cx.notify();
    })
    .size_full()
    .relative()
    .min_h(0)
    .p(16)
    .gap(10)
    .bg(t.popover)
    .text_size(13);
  const help = (el) => el.when(Boolean(view.help), (el) => el.child(helpPanel(d, t, dark)));
  if (d?.jira) return help(root.p(22).child(jiraRender(view, d, t, dark, footer)));
  return help(root
    .child(v_flex().id("pv-list").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(view.scroll).gap(4)
      .children(view.blocks.map((b, i) => v_flex().id(`pv-block-${i}`).p(10).rounded(6).border_1()
        .border_color(i === view.at ? t.accent : t.popover)
        .on_click((_e, cx) => { view.at = i; cx.notify(); })
        .child(b.el)))
      .when(!d, (el) => el.child(div().p(10).text_color(view.error ? t.blocked : t.dim).child(note || "Nothing to show."))))
    .child(footer));
}

// ?: the preview's keys, and what its marks mean, for a Jira issue or a GitHub PR or issue.
function helpPanel(d, t, dark) {
  const keys = [
    ["j k ↓ ↑", "move between blocks"], ["^D ^U", "3 blocks down, up"], ["g G", "top, end"],
    ...(d?.jira
      ? [["↵", "preview a linked issue"], ["^O", "back"], ["s", "change status"], ["⌃↵", "open the block in Jira"]]
      : [["⌃↵", "open the block on GitHub"]]),
    ["r", "refresh"], ["esc space", "close"],
  ];
  const text = (word, color) => div().text_size(12).text_color(color).child(word);
  const marks = d?.jira
    ? [
      [h_flex().gap(4).children(["Bug", "Story", "Task", "Epic"].map((k) => div().size(10).rounded(2).bg(colorOf(TYPE_COLOR, k, dark, t)))), "type: bug, story, task, epic"],
      [h_flex().gap(4).children(["High", "Medium", "Low", "Lowest"].map((p) => div().size(8).rounded(2).bg(colorOf(PRIORITY_COLOR, p, dark, t)))), "priority: high, medium, low, lowest"],
      ...statusLegend(t, dark),
      [text("is blocked by", pick(RED, dark)), "an open issue blocks it"],
      [div().text_size(12).text_color(t.dim).line_through().child("ABC-12"), "the linked issue is done"],
      [epic("Epic", hue("ABC-1", t), t), "parent"],
      [chip("label", t.muted), "label"],
    ]
    : [
      ...stateMarks(t),
      [text("approved", pick(REVIEW_COLOR.APPROVED, dark)), "a review approved it"],
      [text("changes", pick(REVIEW_COLOR.CHANGES_REQUESTED, dark)), "a review asks for changes"],
      [text("failed", pick(CHECK_COLOR.failed, dark)), "a check failed; a click opens it"],
      [text("running", pick(CHECK_COLOR.running, dark)), "a check is running"],
      ...[["ready to merge", "GitHub can merge it"], ["conflicts", "conflicts with the base branch"], ["checks failing", "required checks fail"], ["checks running", "checks have not finished"],
        ["behind base", "the base has newer commits"], ["blocked", "a rule blocks the merge"]].map(([w, x]) => [mergeChip(w, t, dark), x]),
      [chip("behind", t.ansi3), "your checkout is behind the PR"],
      [chip("label", t.dim), "label"],
      [text("bot", t.foreground).opacity(0.5), "faded: a bot wrote it"],
    ];
  return keyPanel(t, [["KEYS", keys], ["MARKS", marks]]);
}

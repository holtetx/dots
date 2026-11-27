// Sidebar footer: context and plan limit gauges (from claude/.claude/hooks/statusline.sh), then the Spacing and Settings buttons. Also syncs mh-settings.json and mh-state.json (settings.js).

import { View, div, svg } from "gpui-kit";
import { h_flex, HoverCard } from "gpui-base";
import { theme, home, readTextFile, watchFolder, layout, run, window as appWindow } from "herdr";
import { syncSettings } from "./settings.js";
import { contextPanel, measure, shownSession } from "./context.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

const DIR = () => `${home()}/.cache/herdr-claude`;
const WINDOWS = [
  ["five_hour", "5h", "5-hour limit"],
  ["seven_day", "7d", "Weekly limit"],
];

// A Pixel HQ gauge: 5 square segments, lit by the fraction used.
function gauge(fraction, fill, track) {
  const lit = fraction > 0 ? Math.ceil(Math.min(1, fraction) * 5) : 0;
  return h_flex().flex_none().gap(1).children([0, 1, 2, 3, 4].map((i) => div().w(4).h(8).rounded(1).bg(i < lit ? fill : track)));
}

const until = (s) => {
  const d = Math.max(0, s - Date.now() / 1000);
  const h = Math.floor(d / 3600), m = Math.round((d % 3600) / 60);
  return d >= 86400 ? `${Math.floor(d / 86400)}d ${Math.floor((d % 86400) / 3600)}h` : h ? `${h}h ${m}m` : `${m}m`;
};

export default class Footer extends View {
  init(_props, cx) {
    this.limits = null;
    syncSettings(cx);
    this.read(cx);
    cx.timer.every(60000, (cx) => appWindow()?.visible !== false && this.read(cx));
    cx.spawn(async (cx) => {
      for (;;) {
        try {
          await watchFolder(DIR());
        } catch {
          return;
        }
        this.read(cx);
      }
    });
  }

  read(cx) {
    cx.spawn(async (cx) => {
      const text = await readTextFile(`${DIR()}/limits.json`).catch(() => null);
      try {
        this.limits = text ? JSON.parse(text) : null;
      } catch {}
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const now = Date.now() / 1000;
    const session = shownSession();
    const shown = WINDOWS.map(([key, short, long]) => ({ key, short, long, w: this.limits?.[key] })).filter((x) => x.w);
    const collapsed = narrow();
    const button = (id, icon, tip, action) => div().id(id).flex_none().p(3).rounded(5).text_color(t.dim)
      .cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_click(action)
      .child(svg(icon).size(13));
    const settings = button("settings", "mods/workspace-chrome/settings.svg", "Settings", () => run("app.settings"));
    const context = (s) => {
      const fill = s.context >= 80 ? t.blocked : s.context >= 60 ? t.ansi3 : t.done;
      const trigger = h_flex()
        .id("limit-context")
        .gap(6)
        .items_center()
        .on_hover((on, cx) => on && measure(s, cx))
        .child(gauge(s.context / 100, fill, t.raised))
        .when(!collapsed, (el) => el.child(div().text_color(s.context >= 60 ? fill : t.muted).child(`CTX ${Math.round(s.context)}%`)));
      return HoverCard.new("context-card").anchor("bottom_left").open_delay(200).trigger(trigger).content(contextPanel(t, s));
    };
    return h_flex()
      .size_full()
      .px(collapsed ? 0 : 12)
      .gap(collapsed ? 8 : 10)
      .items_center()
      .when(collapsed, (el) => el.justify_center())
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .text_size(11)
      .font_semibold()
      .text_color(t.muted)
      .when(Boolean(session), (el) => el.child(context(session)))
      .children(
        shown.map(({ key, short, long, w }) => {
          const stale = w.resets_at && w.resets_at < now;
          const pct = stale ? 0 : Math.round(w.used_percentage ?? 0);
          const fill = pct >= 90 ? t.blocked : pct >= 75 ? t.ansi3 : t.accent;
          return h_flex()
            .id(`limit-${key}`)
            .gap(6)
            .items_center()
            .tooltip(stale ? `${long}: reset since Claude last reported` : `${long}: ${pct}% used${w.resets_at ? `, resets in ${until(w.resets_at)}` : ""}`)
            .child(gauge(pct / 100, fill, t.raised))
            .when(!collapsed, (el) => el.child(div().text_color(pct >= 75 ? fill : t.muted).child(`${short.toUpperCase()} ${pct}%`)));
        }),
      )
      .when(!collapsed, (el) => el.child(div().flex_1()).child(h_flex().flex_none().gap(2)
        .child(button("spacing", "mods/mh-spacing/sliders.svg", "Spacing, hints, links and sidebar", () => run("mod.open", { name: "mh-spacing" })))
        .child(settings)))
      .when(collapsed, (el) => el.child(settings));
  }
}

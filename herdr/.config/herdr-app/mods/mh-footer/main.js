// The Spacing and Settings buttons at the bottom of the sidebar. It also keeps the
// spacing dialog's settings in mh-settings.json and what every window shows alike in
// mh-state.json (settings.js).

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, layout, run } from "herdr";
import { syncSettings } from "./settings.js";

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

export default class Footer extends View {
  init(_props, cx) {
    syncSettings(cx);
  }

  render() {
    const t = theme();
    const collapsed = narrow();
    const button = (id, icon, tip, action) => div().id(id).flex_none().p(3).rounded(5).text_color(t.dim)
      .cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_click(action)
      .child(svg(icon).size(13));
    const settings = button("settings", "mods/workspace-chrome/settings.svg", "Settings", () => run("app.settings"));
    return h_flex()
      .size_full()
      .px(collapsed ? 0 : 12)
      .gap(2)
      .items_center()
      .justify_end()
      .when(collapsed, (el) => el.justify_center())
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .when(!collapsed, (el) => el.child(button("spacing", "mods/mh-spacing/sliders.svg", "Spacing, hints, links and sidebar", () => run("mod.open", { name: "mh-spacing" }))))
      .child(settings);
  }
}

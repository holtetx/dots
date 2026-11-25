// Today's dishes in the Transperia canteen (izy). Without a week the API gives this week.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, theme } from "herdr";

const URL = "https://api.izy.as/api/dishes?canteen_id=2036155";
const pad = (n) => String(n).padStart(2, "0");
const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hide = () => closeOverlay(props().overlay);

export default class Lunch extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.dishes = null;
    this.error = "";
    cx.spawn(async (cx) => {
      try {
        const res = await fetch(URL, { headers: { "Building-Id": "2036148" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const day = Object.values((await res.json()).body ?? {}).find((d) => d?.date === today());
        this.dishes = (day?.menus ?? []).flatMap((m) => m.dishes).sort((a, b) => a.position - b.position).map((d) => d.name.trim());
      } catch (e) {
        this.error = `Could not get the menu: ${e?.message ?? e}`;
      }
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const text = this.error || (!this.dishes ? "Loading…" : this.dishes.length ? null : "No lunch today");
    return v_flex()
      .id("mh-lunch")
      .track_focus(this.handle)
      .on_key_down((e) => {
        if (e.key === "escape" || e.key === "enter") hide();
      })
      .p(16)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .child(
        h_flex()
          .items_center()
          .justify_between()
          .child(div().text_size(15).font_semibold().text_color(t.foreground).child("Lunch today"))
          .child(div().id("mh-lunch-esc").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(hide).child("Esc")),
      )
      .when(!!text, (el) => el.child(div().text_color(t.dim).child(text)))
      .when(!text, (el) => el.children(this.dishes.map((name) => div().text_color(t.foreground).child(name))));
  }
}

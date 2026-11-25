// This week's dishes in the Transperia canteen (izy), today highlighted. Without a week the API gives this week.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, theme } from "herdr";
import { emojis } from "./emoji.js";

const URL = "https://api.izy.as/api/dishes?canteen_id=2036155";
const pad = (n) => String(n).padStart(2, "0");
const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hide = () => closeOverlay(props().overlay);

export default class Lunch extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.days = null;
    this.week = "";
    this.error = "";
    cx.spawn(async (cx) => {
      try {
        const res = await fetch(URL, { headers: { "Building-Id": "2036148" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()).body ?? {};
        this.week = body.week ?? "";
        this.days = Object.entries(body)
          .filter(([, d]) => d?.date)
          .map(([name, d]) => ({ name, date: d.date, dishes: (d.menus ?? []).flatMap((m) => m.dishes).sort((a, b) => a.position - b.position).map((x) => x.name.trim()) }))
          .filter((d) => d.dishes.length);
      } catch (e) {
        this.error = `Could not get the menu: ${e?.message ?? e}`;
      }
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const now = today();
    const text = this.error || (!this.days ? "Loading…" : this.days.length ? null : "No lunch this week");
    return v_flex()
      .id("mh-lunch")
      .track_focus(this.handle)
      .on_key_down((e) => {
        if (e.key === "escape" || e.key === "enter") hide();
      })
      .size_full()
      .min_h(0)
      .p(16)
      .gap(8)
      .bg(t.popover)
      .text_size(13)
      .child(
        h_flex()
          .items_center()
          .justify_between()
          .child(div().text_size(15).font_semibold().text_color(t.foreground).child(this.week ? `Lunch, week ${this.week}` : "Lunch"))
          .child(div().id("mh-lunch-esc").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(hide).child("Esc")),
      )
      .when(!!text, (el) => el.child(div().text_color(t.dim).child(text)))
      .when(!text, (el) =>
        el.child(
          v_flex().id("mh-lunch-days").flex_1().min_h(0).overflow_y_scrollbar().gap(8).children(this.days.map((day) => {
            const on = day.date === now;
            return v_flex()
              .gap(6)
              .px(12)
              .py(10)
              .rounded(10)
              .border_1()
              .border_color(on ? t.accent : t.popover)
              .when(on, (d) => d.bg(t.background))
              .child(
                h_flex()
                  .gap(8)
                  .items_center()
                  .child(div().text_size(12).font_semibold().text_color(on ? t.accent : t.dim).child(day.name))
                  .when(on, (d) => d.child(div().px(6).rounded(5).border_1().border_color(t.accent).text_size(10.5).text_color(t.accent).child("Today"))),
              )
              .children(
                day.dishes.map((name) =>
                  h_flex()
                    .gap(10)
                    .items_center()
                    .child(div().flex_none().text_size(on ? 22 : 16).child(emojis(name)))
                    .child(div().flex_1().min_w(0).text_size(on ? 14 : 13).text_color(on ? t.foreground : t.dim).child(name)),
                ),
              );
          })),
        ),
      );
  }
}

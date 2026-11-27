// This week's dishes in a canteen (izy), today highlighted. Without a week the API gives this week.
// The canteen is per Mac, shared("mh-lunch") from mh-state.json: { canteen, building }, izy's IDs.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, theme, shared, checking } from "herdr";
import { emojis } from "./emoji.js";
import { action, frame, helpKey, keyPanel } from "./pixel.js";
import { track, trackKey } from "./stats.js";

const canteen = () => {
  const c = shared("mh-lunch");
  return /^\d+$/.test(c?.canteen ?? "") && /^\d+$/.test(c?.building ?? "") ? c : null;
};
const pad = (n) => String(n).padStart(2, "0");
const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const tidy = (name) => name.replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ").trim();
const hide = () => closeOverlay(props().overlay);

export default class Lunch extends View {
  init(_props, cx) {
    track("mh-lunch.open", "open");
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.days = null;
    this.week = "";
    this.place = "";
    this.error = "";
    const c = canteen();
    // No canteen on this Mac (home): ctrl-a l and the palette entry do nothing.
    if (!c) return void (checking() || hide());
    cx.spawn(async (cx) => {
      try {
        const res = await fetch(`https://api.izy.as/api/dishes?canteen_id=${c.canteen}`, { headers: { "Building-Id": String(c.building) } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()).body ?? {};
        this.week = body.week ?? "";
        this.days = Object.entries(body)
          .filter(([, d]) => d?.date)
          .map(([name, d]) => {
            this.place ||= d.menus?.[0]?.canteen_name ?? "";
            const dishes = (d.menus ?? []).flatMap((m) => m.dishes).sort((a, b) => a.position - b.position);
            return { name, date: d.date, dishes: dishes.map((x) => tidy(x.name)) };
          })
          .filter((d) => d.dishes.length);
      } catch (e) {
        this.error = `Could not get the menu: ${e?.message ?? e}`;
      }
      cx.notify();
    });
  }

  today(t, day) {
    return frame(v_flex(), t.accent, t.raised)
      .gap(10)
      .p(14)
      .child(div().text_size(11).font_semibold().text_color(t.accent).child(`TODAY · ${day.name.toUpperCase()}`))
      .children(
        day.dishes.map((name) => {
          const [lead, ...more] = emojis(name);
          return h_flex()
            .gap(12)
            .items_center()
            .child(h_flex().flex_none().w(44).h(44).rounded(4).bg(t.background).items_center().justify_center().text_size(26).child(lead))
            .child(
              v_flex()
                .flex_1()
                .min_w(0)
                .gap(2)
                .child(div().text_size(15).font_medium().text_color(t.foreground).child(name))
                .when(more.length > 0, (el) => el.child(div().text_size(13).child(more.join(" ")))),
            );
        }),
      );
  }

  row(t, day, past) {
    return v_flex()
      .px(14)
      .py(4)
      .gap(2)
      .when(past, (el) => el.opacity(0.45))
      .children(
        day.dishes.map((name, i) =>
          h_flex()
            .h(30)
            .gap(10)
            .items_center()
            .child(div().flex_none().w(44).text_size(11.5).font_medium().text_color(t.dim).child(i ? "" : day.name.slice(0, 3)))
            .child(h_flex().flex_none().w(28).justify_center().text_size(17).child(emojis(name, 1)[0]))
            .child(div().flex_1().min_w(0).text_size(13).text_color(t.muted).child(name)),
        ),
      );
  }

  render() {
    const t = theme();
    const now = today();
    const text = this.error || (!this.days ? "Loading…" : this.days.length ? null : "No lunch this week");
    const sub = [this.place, this.week && `week ${this.week}`].filter(Boolean).join(" · ");
    return v_flex()
      .id("mh-lunch")
      .relative()
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        trackKey("mh-lunch", e, false);
        if (helpKey(this, e)) return cx.stop_propagation(), cx.notify();
        if (e.key === "escape" || e.key === "enter") hide();
      })
      .when(Boolean(this.help), (el) => el.min_h(270))
      .px(14)
      .pt(14)
      .pb(12)
      .gap(10)
      .bg(t.popover)
      .child(
        h_flex()
          .px(4)
          .items_center()
          .gap(8)
          .child(div().text_size(16).font_semibold().text_color(t.foreground).child("LUNCH"))
          .child(div().flex_1().text_size(12).text_color(t.dim).child(sub))
          .child(action(t, "mh-lunch-esc", "Esc", false, hide)),
      )
      .when(!!text, (el) => el.child(div().px(4).pb(4).text_size(13).text_color(t.dim).child(text)))
      .when(!text, (el) => el.children(this.days.map((day) => (day.date === now ? this.today(t, day) : this.row(t, day, day.date < now)))))
      .child(h_flex().px(4).justify_end().text_size(11).text_color(t.dim).child("? keys · esc close"))
      .when(Boolean(this.help), (el) => el.child(keyPanel(t, [
        ["KEYS", [["esc ↵", "close"]]],
        ["MARKS", [
          [frame(div(), t.accent, t.raised).px(6).text_size(11).font_semibold().text_color(t.accent).child("TODAY"), "today's dishes"],
          [div().opacity(0.45).text_size(11.5).font_medium().text_color(t.dim).child("Mon"), "a day that has passed"],
          [div().text_size(17).child("🍽️"), "no known food word in its name"],
        ]],
      ])));
  }
}

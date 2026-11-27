// SSH to a host from ~/.ssh/config (ctrl-a s): a space named after it with ssh in it; with ⌘↵ also
// Claude on the right, told how to use the connection (⌘↵ on an open host adds it). The ssh terminal gets the label
// mh.ssh=<host>, so mh-spaces lists the space under SSH and a second pick focuses it.
// Per Mac, shared("mh-ssh") from mh-state.json: { op, hostname, folder }, all optional. op is an
// op:// reference, or { "<alias ending>": ref, "*": ref }; askpass.sh fills password prompts from
// it, only for hosts whose HostName hostname covers (hosts.js). folder is where Claude starts.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { spaces, terminals, theme, props, run, exec, home, appHome, readTextFile, shared, closeOverlay, notify } from "herdr";
import { covers, readHosts } from "./hosts.js";
import { field } from "./pixel.js";

const LIST = 440;
const FEW = 10; // at most this many hosts: list them all before typing
const ICON = (name) => `mods/workspace-chrome/${name}.svg`;

const expand = (path) => path.replace(/^~(?=\/|$)/, home());

// ~/.ssh/config's hosts (hosts.js). IFS= keeps a path with spaces whole; the glob still expands.
const io = () => ({
  home: home(),
  read: (file) => readTextFile(file).catch(() => null),
  glob: async (pattern) => ((await exec("sh", ["-c", 'IFS=; for f in $1; do [ -f "$f" ] && printf "%s\\n" "$f"; done', "sh", pattern]).catch(() => null))?.stdout ?? "").split("\n").filter(Boolean),
});
const loadHosts = () => readHosts(`${home()}/.ssh/config`, io());

function brief(h, sock) {
  const where = [h.note, h.hostname && (h.port ? `${h.hostname}:${h.port}` : h.hostname)].filter(Boolean).join(", ");
  return [
    `You work on the remote host ${h.alias}${where ? ` (${where})` : ""}, over ssh.`,
    `The user's ssh session to it runs in the pane beside you: the Herdr terminal that \`hc ls --label mh.ssh=${h.alias}\` lists.`,
    `- Run commands on the host only like this: ssh -S ${sock} -o ProxyCommand=false ${h.alias} '<command>'. It uses the open connection. ProxyCommand=false makes it fail at once when the connection is closed, so it never tries a new login. Never drop that option.`,
    `- See what the user sees: hc read <that terminal> --lines 80.`,
    `- Do not type into the user's pane (hc send) unless they ask.`,
    `- If that fails with "Connection closed by UNKNOWN", the connection is closed. Tell the user; do not log in another way.`,
  ].join("\n");
}

async function connect(h, withClaude) {
  const sock = `${home()}/.ssh/mh-${h.alias}.sock`;
  const cfg = shared("mh-ssh") ?? {};
  const claude = () => withClaude && run("terminal.open", { place: "right", folder: expand(cfg.folder ?? "~"), argv: ["claude", "--disallowedTools", "Bash(op *)", "--append-system-prompt", brief(h, sock)] });
  const open = terminals().find((k) => k.labels?.["mh.ssh"] === h.alias);
  const space = open && spaces().find((s) => !s.machine && s.id === open.labels["herdr.space"]);
  if (space) {
    run("space.select", { id: space.id });
    return claude();
  }
  // Logout or ctrl-c closes the space; only a lost connection (255) offers to reconnect, never a local prompt.
  // rm: a socket left by a killed ssh would turn multiplexing off.
  const loop = String.raw`hc label "$HC_TERMINAL_ID" "mh.ssh=$2" >/dev/null
close() { hc label "$HC_TERMINAL_ID" mh.ssh= >/dev/null; id=$(hc get "$HC_TERMINAL_ID" --json | sed -n 's/.*"herdr\.space":"\([^"]*\)".*/\1/p'); [ -n "$id" ] && herdr-app do space.close --id "$id" --confirmed true >/dev/null; exit; }
trap close INT
while :; do rm -f "$1"; ssh -o ControlMaster=yes -o ControlPath="$1" "$2"; [ $? -eq 255 ] || close; printf "\nConnection to %s lost. Enter reconnects, ctrl-d closes the space.\n" "$2"; read -r _ || close; done`;
  const ssh = ["sh", "-c", loop, "sh", sock, h.alias];
  // Only hosts on the given network get a password: any other host that asks must not get it.
  // ssh -G: the HostName ssh really uses, and no jump host (ProxyJump, or ssh in ProxyCommand) that could ask for the password.
  const resolved = cfg.hostname ? (await exec("ssh", ["-G", "--", h.alias], { timeout: 5000 }).catch(() => null))?.stdout ?? "" : "";
  const trusted = Boolean(cfg.hostname) && resolved.split("\n").some((l) => l.startsWith("hostname ") && covers(cfg.hostname, l.slice(9))) && !/^proxyjump (?!none$)/m.test(resolved) && !/^proxycommand .*\bssh\b/m.test(resolved);
  const op = !trusted ? null : typeof cfg.op === "string" ? cfg.op : cfg.op?.[Object.keys(cfg.op).find((end) => end !== "*" && h.alias.endsWith(end)) ?? "*"];
  const argv = op ? ["env", `HERDR_APP_HOME=${appHome()}`, `SSH_ASKPASS=${appHome()}/mods/mh-ssh/askpass.sh`, "SSH_ASKPASS_REQUIRE=force", `MH_SSH_OP=${op}`, ...ssh] : ["env", `HERDR_APP_HOME=${appHome()}`, ...ssh];
  run("space.new", { name: h.alias, folder: home(), argv });
  claude();
}

export default class Ssh extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.text = "";
    this.at = 0;
    this.hosts = null;
    this.scroll = ScrollHandle.new();
    this.input = InputState.new({ placeholder: "SSH to…" });
    this.input.on("change", (_e, cx) => {
      this.text = this.input.value();
      this.at = 0;
      cx.notify();
    });
    this.input.on("submit", (e) => this.go(this.items()[this.at], e.secondary));
    this.input.focus();
    cx.spawn(async (cx) => {
      this.hosts = [...(await loadHosts()).values()];
      cx.notify();
    });
  }

  hide() {
    const id = props()?.overlay;
    if (id) closeOverlay(id);
  }

  items() {
    const tokens = this.text.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) {
      // In an SSH space its host is first and selected, so ⌘↵ adds Claude without typing.
      // A short host list shows in full before typing; a long one only after.
      const shown = spaces().find((s) => s.active);
      const alias = shown && terminals().find((k) => k.labels?.["herdr.space"] === shown.id && k.labels?.["mh.ssh"])?.labels["mh.ssh"];
      const hosts = this.hosts ?? [];
      const current = hosts.filter((h) => h.alias === alias);
      return hosts.length > FEW ? current : [...current, ...hosts.filter((h) => h.alias !== alias)];
    }
    return (this.hosts ?? []).filter((h) => tokens.every((t) => `${h.alias} ${h.note} ${h.hostname}`.toLowerCase().includes(t)));
  }

  go(h, withClaude) {
    if (!h) return;
    // Hide after: closing the dialog cancels its pending calls (the ssh -G check).
    connect(h, withClaude)
      .catch((e) => notify({ title: `SSH to ${h.alias}`, body: String(e?.message ?? e), level: "error" }))
      .finally(() => this.hide());
  }

  render() {
    const t = theme();
    const items = this.items();
    this.at = Math.min(this.at, Math.max(0, items.length - 1));
    const row = (h, i) =>
      h_flex()
        .id(`host-${h.alias}`)
        .h(32)
        .flex_none()
        .px(10)
        .gap(9)
        .items_center()
        .rounded(4)
        .cursor_pointer()
        .when(i === this.at, (el) => el.bg(t.selected))
        .when(i !== this.at, (el) => el.hover((st) => st.bg(t.hover)))
        .on_click(() => this.go(h))
        .child(svg(ICON("server")).size(13).flex_none().text_color(t.dim))
        .child(div().flex_none().text_color(t.foreground).child(h.alias))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(h.note));
    const typed = this.text.trim() !== "";
    const height = typed || items.length ? Math.min(LIST, Math.max(40, items.length * 32)) : 0;
    return v_flex()
      .id("ssh")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        const count = items.length;
        const ctrl = e.modifiers.control && !e.modifiers.platform && !e.modifiers.alt && !e.modifiers.shift;
        if (e.key === "escape") return this.hide();
        if ((e.key === "down" || (ctrl && (e.key === "j" || e.key === "n"))) && count) this.at = (this.at + 1) % count;
        else if ((e.key === "up" || (ctrl && (e.key === "k" || e.key === "p"))) && count) this.at = (this.at + count - 1) % count;
        else return;
        this.scroll.scroll_to_item(this.at);
        cx.stop_propagation();
        cx.notify();
      })
      .w_full()
      .min_h(0)
      .p(18)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child("SSH"))
      .child(
        h_flex()
          .h(36)
          .flex_none()
          .relative()
          .px(12)
          .gap(8)
          .items_center()
          .children(field(t.accent, t.background))
          .child(svg(ICON("search")).size(15).text_color(t.dim))
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)),
      )
      .child(
        v_flex()
          .id("ssh-list")
          .h(height)
          .flex_none()
          .overflow_y_scrollbar()
          .track_scroll(this.scroll)
          .children(items.map(row))
          .when(typed && items.length === 0, (el) => el.child(div().p(10).text_color(t.dim).child(this.hosts ? "No matching hosts in ~/.ssh/config." : "Reading ~/.ssh/config…"))),
      )
      .child(h_flex().justify_end().text_size(11).text_color(t.dim).child("↵ ssh · ⌘↵ ssh and Claude · esc close"));
  }
}

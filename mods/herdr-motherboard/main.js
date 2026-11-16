// herdr-motherboard: every agent as a chip on an ASCII-style motherboard, travelling along
// the traces to the component that matches what it's doing. Placement rules are in
// model.js, geometry in board.js, the demo's simulated agents in demo.js. Continuous
// motion is native (transition, loop, frames); the script re-renders only on data
// changes and at path corners.
//
// "All machines" is an overview with one card per machine; clicking a card (or a machine
// in the Machines row) opens that machine's own board, drawn flat ("board"), in 3D ASCII
// ("iso", iso.js) or as a logic analyzer of each agent's history ("scope", scope.js).

import { View, div, PathBuilder } from "gpui-kit";
import { h_flex, v_flex, Popup, InputState, Input } from "gpui-base";
import { agents, terminals, hc, machines, spaces, panes, focused, theme, themes as herdrThemes, run, exec, home, appHome, shared, setShared, props, openOverlay, closeOverlay, readTextFile, notify, watchFolder, writeTextFile, nextCommand } from "herdr";
import * as fs from "fs/promises";
import os from "os";
import { W, H, LH, ADV, LABEL, MEANS, ALERT, buildBoard, buildSlots, route, plan } from "./board.js";
import { compFor, activity, why, crowd, splitAddress, parsePs, descendants, commandOf, ignoredPath, screenTail, sendError, promptOptions, promptKey, WRITE_WINDOW_MS } from "./model.js";
import { DEFAULT_THEME, parseTheme, themeOrder, palette, chipColors, themeFile } from "./themes.js";
import { Demo } from "./demo.js";
import { osName, isWindows, PROCESS_KINDS, processCommand, nameCommands, openCommand, normPath, samePath, inside } from "./platform.js";
import { isoScene, runsOf, isoTrail } from "./iso.js";
import { SPANS, spanLabel, sample, prune, wave, ticks, level } from "./scope.js";

const MONO = "JetBrains Mono";
const DWELL = 800;
const MOD = "herdr-motherboard";
const KEY = `${MOD}.settings`;
/** Where settings lived when the mod was called "motherboard"; read once to carry them over. */
const OLD_KEY = "motherboard.settings";
const DEFAULTS = { view: "board", names: "space", span: SPANS[1], winW: 1240, winH: 760, theme: "herdr", labels: "hover", motion: "full", ticker: true, spaces: null, machine: "all", demo: false, cardW: 460, cardH: 480, expanded: [] };
const CYCLE = { view: ["board", "iso", "scope"], names: ["space", "address"], span: SPANS, labels: ["hover", "short", "full", "off"], motion: ["full", "reduced", "off"] };
const PLATFORM = osName(os.platform());
/** Smallest window a drag can make, in px. */
/** The pinned card's smallest size; it starts at cardW × cardH in settings. */
const DEMO_HERE = "workstation";
const CARD_MIN_W = 340, CARD_MIN_H = 260;
const MIN_W = 560, MIN_H = 360;
/** While an edge is dragged, the window grows this far past its edges, invisibly, so the
 *  pointer stays over it: a mod only hears the pointer while it's over the mod. */
const CATCH = 2400;
/** The window Herdr opens: no size, so it's as big as the board makes itself; no frame, so the
 *  board draws its own and the catch area above stays invisible. */
const WINDOW = { mod: "herdr-motherboard", kind: "window", key: "herdr-motherboard", keep: true, frame: "none" };
const VIEWS = [["board", "the flat motherboard"], ["iso", "the board in 3D ASCII"], ["scope", "each agent's history as a trace"]];
/** Header button width for a label of up to n characters at 11.5 px (0.6 em per character). */
const BTN_W = (n) => Math.ceil(n * 6.9 + 14);
/** After a failed process query, wait this long before asking that machine again. */
const PROC_RETRY_MS = 30000;
const FAN = ["◜", "◝", "◞", "◟"];
const settings = () => ({ ...DEFAULTS, ...(shared(KEY) ?? {}) });
const save = (patch) => setShared(KEY, { ...settings(), ...patch });
/** A color at alpha `a` (two hex digits); any #rgb, #rrggbb or #rrggbbaa. */
const alpha = (c, a) => {
  if (typeof c !== "string") return c;
  let h = c.slice(1);
  if (h.length === 3) h = [...h].map((x) => x + x).join("");
  return c[0] === "#" && /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h) ? `#${h.slice(0, 6)}${a}` : c;
};
/** Black or white, whichever reads better on `c` (#rgb or #rrggbb). */
const inkOn = (c) => {
  let h = String(c ?? "").slice(1);
  if (h.length === 3) h = [...h].map((x) => x + x).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.55 ? "#11111b" : "#ffffff";
};
/** "role" or "role/aa" → a color under palette P. */
const spec = (P, s) => { const [r, a] = s.split("/"); return a ? alpha(P[r], a) : P[r]; };
/**
 * Space colors, the way Herdr's sidebar draws them: shared "space.colors" keeps a theme color
 * name or #hex per space id, and stored names map to these marks. The sidebar assigns them;
 * the board only reads. Demo spaces get the sidebar's colors in its order.
 */
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
const PROJECT_COLORS = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
const SPIN = ["|", "/", "-", "\\"];
const safeGlyph = (ch) => { const c = ch.codePointAt(0); return c < 0x7f || (c >= 0xa0 && c <= 0xff); };
const fmtDur = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); if (s < 60) return s + "s"; const m = Math.floor(s / 60); return m < 60 ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`; };
const clock = (d) => d.toTimeString().slice(0, 8);
const machineKey = (r) => r.machine ?? "local";
/** A scrolling popover. `overflow_y_scrollbar` drops `absolute()`, so a plain box does the placing. */
const floating = (left, top, w, h, list) => div().absolute().left(left).top(top).w(w).h(h).child(list.size_full().overflow_y_scrollbar());
const THEME_DIR = () => `${appHome()}/mods/${MOD}/themes`;
const BUILTIN = () => new Map([[DEFAULT_THEME, { id: DEFAULT_THEME, name: "Herdr", colors: {}, programs: {} }]]);
/** The overview's component cells, in board order. */
const CELLS = [["cpu0", "CPU", "cpu"], ["pch", "PCH", "pch"], ["nic", "NIC", "nic"], ["nvme", "NVMe", "nvme"], ["gpu", "PCIe", "gpu"], ["alert", "NEEDS YOU", "bios"], ["fault", "FAULT", "fault"], ["post", "POST", "post"], ["ram", "RAM", "ram"]];

export default class Motherboard extends View {
  init(_props, cx) {
    this.size = null;
    this.recs = new Map();
    this.arrN = 0;
    this.moveN = 0;
    this.fading = [];
    this.log = [];
    this.hover = null;
    this.pill = { hover: null, leftAt: 0, pinned: null, inside: false };
    this.menu = null;
    /** The agent whose card is pinned open (a click on its chip) to message it; where the card sits. */
    this.pin = null;
    this.pinAt = null;
    this.pinN = 0;
    this.screen = null;
    this.sent = null;
    this.typing = false;
    /** A blocked agent's "Type something." choice, picked: the box then answers it. */
    this.answering = null;
    /** A drag of the pinned card: { mode: "move" | "size", x0, y0, at, w, h }. */
    this.cardDrag = null;
    this.instant = true;
    this.sel = -1;
    this.repoOf = new Map();
    this.watching = new Set();
    this.boardKey = null;
    this.pathsKey = null;
    this.demo = null;
    this.demoOn = false;
    this.localName = "this computer";
    this.procKind = new Map();
    this.procFail = new Map();
    this.focus = cx.focus_handle();
    /** For a control's mouse down: take the keyboard (so Esc and the keys work), keep the press. */
    this.press = (_e, cx) => { this.endCardDrag(); this.focus.focus(); cx.stop_propagation(); };
    this.msg = InputState.new({ placeholder: "Message this agent" });
    this.msg.on("submit", (_e, cx) => this.sendMsg(cx));
    this.msg.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.msg.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    // A window doesn't take the keyboard when it opens; this one does, so Esc closes it.
    if (props()?.overlay) cx.timer.after(80, () => this.focus.focus());
    if (shared(KEY) == null && shared(OLD_KEY) != null) setShared(KEY, shared(OLD_KEY));
    this.themeDefs = BUILTIN();
    this.themeErrors = [];
    this.themeRev = 0;
    cx.spawn(async (cx) => {
      for (;;) {
        await this.loadThemes();
        cx.notify();
        try { await watchFolder(THEME_DIR()); } catch (_e) { return; }
      }
    });
    cx.spawn(async (cx) => {
      for (const [cmd, args] of nameCommands(PLATFORM)) {
        try {
          const r = await exec(cmd, args, { timeout: 3000 });
          if (r.code === 0 && r.stdout.trim()) { this.localName = r.stdout.trim(); this.boardKey = null; cx.notify(); return; }
        } catch (_e) { /* not on this OS: try the next */ }
      }
    });
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "focus") this.focus.focus();
        else if (c === "demo") save({ demo: !settings().demo });
        else if (c === "all" || c === "local") save({ machine: c });
        else if (c === "next-theme") this.cycle("theme");
        else if (c === "close") this.close();
        else if (c === "grow") this.grow();
        else if (c === "full") this.toggleFull();
        else if (/^size-\d+x\d+$/.test(c)) { const [w, h] = c.slice(5).split("x").map(Number); save({ winW: Math.max(MIN_W, w), winH: Math.max(MIN_H, h) }); }
        else if (c === "no-spaces" || c === "all-spaces") save({ spaces: c === "no-spaces" ? [] : null });
        else if (c === "spaces" || c === "themes" || c === "legend") this.toggleMenu(c);
        else if (c.startsWith("menu-")) this.toggleMenu(c.slice(5));
        else if (CYCLE.view.includes(c)) { save({ view: c }); this.instant = true; }
        else if (c.startsWith("machine:")) save({ machine: c.slice(8) || "all" });
        cx.notify();
      }
    });
    this.sync(cx);
    this.pump(cx);
    this.observe(cx, 0);
  }

  /* ---------------- data ---------------- */

  spaceOk(r, S) {
    if (S.spaces === "current") return r.spaceId === focused()?.space;
    if (Array.isArray(S.spaces)) return S.spaces.includes(r.spaceId);
    return true;
  }

  /** On a machine's board: only that machine's agents. In the overview: every machine. */
  visible(r, S = settings()) {
    return this.spaceOk(r, S) && (S.machine === "all" || machineKey(r) === S.machine);
  }

  /** Every machine Herdr knows (or the demo's two), this computer first. */
  machineList() {
    if (this.demoOn) return [{ key: "local", name: DEMO_HERE, note: "this computer", online: true }, { key: this.demo.remote, name: this.demo.remote, note: "demo", online: true }];
    return [{ key: "local", name: this.localName, note: "this computer", online: true },
      ...machines().filter((m) => m.name).map((m) => ({ key: m.name, name: m.name, note: "over ssh", online: m.layout !== "unavailable" }))];
  }

  spaceList() { return this.demoOn ? this.demo.spaces() : spaces(); }

  /** Reads Herdr's live state (or the demo's) into this.recs and starts moves. Returns whether anything changed. */
  sync(cx) {
    const now = Date.now();
    const S = settings();
    let changed = false;
    if (!!S.demo !== this.demoOn) {
      this.demoOn = !!S.demo;
      // Made-up machine names, so a demo (and a screenshot of one) shows none of yours.
      this.demo = this.demoOn ? new Demo("build-box") : null;
      this.recs.clear(); this.log = []; this.fading = []; this.hover = null; this.pill.pinned = null;
      changed = true;
    }
    const seen = new Set();
    const upsert = (address, info, t, obs) => {
      seen.add(address);
      let r = this.recs.get(address);
      if (!r) {
        const { label, machine } = splitAddress(address);
        r = { address, label, machine, remote: !!machine, comp: null, arr: 0, act: "cpu", cmd: null, files: 0, fileSet: new Set(), lastWrite: 0, workingSince: null, since: now, moving: null, arrivedAt: 0, status: undefined, baseline: null };
        this.recs.set(address, r);
        changed = true;
      }
      const rep = t?.report ?? null;
      let status = info?.status ?? rep?.state ?? (typeof t?.status === "string" ? t.status : null);
      if (!info && t?.parent) status = status === "done" ? "idle" : status;
      if (status !== r.status) {
        const first = r.status === undefined;
        if (status === "working") { r.workingSince = first && t?.status_ms ? t.status_ms : now; r.files = 0; r.fileSet = new Set(); }
        r.act = "cpu"; r.cmd = null;
        r.since = first && t?.status_ms ? t.status_ms : now;
        r.status = status;
        changed = true;
      }
      if (obs && status === "working") {
        r.act = obs.act; r.cmd = obs.cmd; r.files = obs.files;
        if (obs.act === "nvme") r.lastWrite = now;
      }
      const next = {
        kind: rep?.kind ?? null, msg: rep?.msg ?? null, progress: rep?.progress ?? null,
        title: info?.title || rep?.title || t?.title || "", app: info?.app ?? rep?.app ?? null, program: info?.program ?? t?.program ?? null,
        space: info?.space_name ?? null, spaceId: info?.space ?? null, tab: info?.tab_name ?? null, focused: !!info?.focused,
        cwd: t?.foreground?.cwd ?? t?.cwd ?? null, pid: t?.foreground?.pid ?? null, turn: t?.turn ?? null, parent: t?.parent ?? null,
      };
      for (const [k, v] of Object.entries(next)) if (r[k] !== v) { r[k] = v; changed = true; }
    };
    if (this.demoOn) {
      this.demo.tick(now);
      for (const f of this.demo.feed()) upsert(f.address, f.info, f.term, f.obs);
    } else {
      const terms = new Map(terminals().map((t) => [t.address, t]));
      for (const a of agents()) upsert(a.address, a, terms.get(a.address));
      // Sub-agents without a pane, and agent programs that haven't reported a status yet.
      for (const t of terms.values()) {
        if (seen.has(t.address) || t.state !== "live") continue;
        if ((t.parent && (t.report || t.status)) || t.program?.agent) upsert(t.address, null, t);
      }
    }
    for (const [address, r] of this.recs) {
      if (!seen.has(address)) {
        this.recs.delete(address);
        if (this.pin === address) this.pin = null;
        if (this.hover === address) this.hover = null;
        // An expanded card is that agent's; a later terminal with the same address starts collapsed.
        if ((S.expanded ?? []).includes(address)) save({ expanded: settings().expanded.filter((a) => a !== address) });
        changed = true;
        continue;
      }
      if (r.parent) {
        const p = this.recs.get(r.parent);
        if (p) { r.spaceId ??= p.spaceId; r.space ??= p.space; r.tab ??= p.tab; }
      }
      if (!this.demoOn && r.act === "nvme" && now - r.lastWrite > WRITE_WINDOW_MS) { r.act = "cpu"; changed = true; }
    }
    // Place newcomers directly; move the rest when their component changes.
    for (const r of this.recs.values()) {
      const want = compFor(r);
      if (r.comp == null) { r.comp = want; r.arr = ++this.arrN; r.arrivedAt = now; r.hist = [{ t: Math.min(now, r.since ?? now), comp: want }]; changed = true; continue; }
      if (want === r.comp || r.moving) continue;
      if (now - r.arrivedAt < DWELL && !ALERT.has(want)) continue;
      this.startMove(cx, r, want);
      changed = true;
    }
    // Once, after the first look: forget expanded cards of this computer's agents that ended while
    // the board was closed. Other machines' agents may not have reported yet, so they stay.
    if (!this.demoOn && !this.prunedExpanded) {
      this.prunedExpanded = true;
      const keep = (S.expanded ?? []).filter((a) => a.includes("/") || this.recs.has(a));
      if (keep.length !== (S.expanded ?? []).length) save({ expanded: keep });
    }
    const sig = [...this.recs.values()].map((r) => `${r.address}:${r.status}:${r.comp}:${r.act}:${r.cmd}:${r.files}:${r.msg}:${r.progress}:${r.focused}`).join("|");
    if (sig !== this.sig) { this.sig = sig; changed = true; }
    return changed;
  }

  /** The board's data loop: cheap JS, redraws only when something changed. */
  pump(cx) {
    let changed = this.sync(cx);
    if (this.instant) { this.instant = false; changed = true; }
    if (this.pill.hover == null && this.pill.leftAt && Date.now() - this.pill.leftAt > 300 && !this.pill.inside) { this.pill.leftAt = 0; changed = true; }
    if (this.hoverGone()) { this.hover = null; changed = true; }
    this.syncCard(cx);
    // The scope scrolls with time even when nothing changes.
    const S = settings();
    if (S.view === "scope" && S.machine !== "all" && Date.now() - (this.scopeAt ?? 0) > Math.max(400, S.span / 240)) { this.scopeAt = Date.now(); changed = true; }
    if (changed) cx.notify();
    const busy = this.demoOn || [...this.recs.values()].some((r) => r.moving) || this.fading.length;
    cx.timer.after(busy ? 200 : 400, (cx) => this.pump(cx));
  }

  /** Watches what agents do to their machine: commands they start, files they change. */
  observe(cx, n) {
    cx.spawn(async (cx) => {
      if (!this.demoOn) {
        const recs = [...this.recs.values()];
        const local = recs.filter((r) => !r.remote && r.pid);
        const anyWorking = local.some((r) => r.status === "working");
        // Refresh idle baselines every 10 s even when nothing works, so helpers aren't counted later.
        // Windows has no ps; its PowerShell query is slower, so it runs half as often.
        const slow = isWindows(PLATFORM) && n % 2 === 1;
        if (local.length && !slow && (anyWorking || n % 5 === 0)) {
          const procs = await this.listProcs(null);
          if (procs) for (const r of local) this.applyProcs(r, procs);
        }
        if (n % 3 === 0) {
          const byMachine = new Map();
          for (const r of recs) if (r.remote && r.pid) { if (!byMachine.has(r.machine)) byMachine.set(r.machine, []); byMachine.get(r.machine).push(r); }
          for (const [machine, list] of byMachine) {
            if (!list.some((r) => r.status === "working") && n % 15 !== 0) continue;
            const procs = await this.listProcs(machine);
            if (procs) for (const r of list) this.applyProcs(r, procs);
          }
        }
        for (const r of local) if (r.status === "working") this.watchRepo(cx, r);
        if (this.sync(cx)) cx.notify();
      }
      cx.timer.after(2000, (cx) => this.observe(cx, n + 1));
    });
  }

  /**
   * Every process on a machine (null: this one), or null when it can't be asked: no ps and no
   * PowerShell, or unreachable. A remote machine's OS isn't known, so the first query that works
   * is remembered; a failure waits PROC_RETRY_MS, and the board places agents by state alone.
   */
  async listProcs(machine) {
    const key = machine ?? "local";
    if (Date.now() - (this.procFail.get(key) ?? 0) < PROC_RETRY_MS) return null;
    const known = this.procKind.get(key);
    const kinds = known ? [known] : machine ? PROCESS_KINDS : [isWindows(PLATFORM) ? "windows" : "unix"];
    for (const kind of kinds) {
      const [cmd, args] = processCommand(kind);
      try {
        const out = await exec(cmd, args, { ...(machine ? { on: machine } : {}), timeout: kind === "windows" ? 15000 : 8000 });
        const procs = out.code === 0 ? parsePs(out.stdout) : [];
        if (procs.length) { this.procKind.set(key, kind); this.procFail.delete(key); return procs; }
      } catch (_e) { /* not this kind here, or unreachable */ }
    }
    this.procKind.delete(key);
    this.procFail.set(key, Date.now());
    return null;
  }

  applyProcs(r, procs) {
    if (r.status !== "working") {
      r.baseline = new Set(descendants(procs, r.pid).map((p) => p.pid));
      return;
    }
    const c = commandOf(procs, r.pid, Date.now() - (r.workingSince ?? Date.now()), r.baseline);
    if (c) { r.act = c.act; r.cmd = c.cmd; }
    else if (r.act === "pch" || r.act === "nic") { r.act = Date.now() - r.lastWrite < WRITE_WINDOW_MS ? "nvme" : "cpu"; r.cmd = null; }
  }

  watchRepo(cx, r) {
    if (!r.cwd) return;
    if (!this.repoOf.has(r.cwd)) {
      this.repoOf.set(r.cwd, undefined);
      cx.spawn(async () => {
        let root = null;
        try {
          const out = await exec("git", ["-C", r.cwd, "rev-parse", "--show-toplevel"], { timeout: 4000 });
          root = out.code === 0 ? normPath(out.stdout.trim()) || null : null;
        } catch (_e) { root = null; }
        // Never watch a whole home folder: it's every repo and every node_modules at once.
        if (root && samePath(root, home(), PLATFORM)) root = null;
        this.repoOf.set(r.cwd, root);
      });
      return;
    }
    const root = this.repoOf.get(r.cwd);
    r.repo = root ?? null;
    if (!root || this.watching.has(root)) return;
    this.watching.add(root);
    cx.spawn(async (cx) => {
      for (;;) {
        let paths;
        try { paths = await watchFolder(root); } catch (_e) { break; }
        const mine = [...this.recs.values()].filter((x) => x.repo === root && x.status === "working");
        if (!mine.length) break;
        const real = paths.map((p) => inside(p, root, PLATFORM)).filter((rel) => rel && !ignoredPath("/" + rel));
        if (!real.length) continue;
        const now = Date.now();
        for (const x of mine) {
          x.lastWrite = now;
          for (const rel of real) x.fileSet.add(rel);
          x.files = x.fileSet.size;
          if (x.act === "cpu") x.act = "nvme";
        }
        if (this.sync(cx)) cx.notify();
      }
      this.watching.delete(root);
    });
  }

  /* ---------------- placement & motion ---------------- */

  ensureBoard(S) {
    const m = this.machineList().find((x) => x.key === S.machine) ?? this.machineList()[0];
    const key = `${m.name}|${m.online}`;
    if (key !== this.boardKey) { this.board = buildBoard({ machine: m.name, online: m.online }); this.boardKey = key; this.slotsKey = null; this.pathsKey = null; this.iso = null; }
    if (S.view === "iso" && !this.iso) { this.iso = isoScene(this.board.comps, m.name); this.isoRuns = runsOf(this.iso.cells); }
    const cells = this.chipCells(S);
    const sp = S.labels === "short" ? 14 : cells + 2;
    if (this.slotsKey !== `${sp}|${cells}`) { this.slots = buildSlots(this.board.comps, sp, cells); this.slotsKey = `${sp}|${cells}`; this.sp = sp; }
  }

  /** Slot positions per machine board; agents of other machines are placed on their own board's slots. */
  places(S = settings()) {
    this.ensureBoard(S);
    const byComp = {};
    for (const r of this.recs.values()) {
      if (!this.spaceOk(r, S)) continue;
      (byComp[`${machineKey(r)}|${r.comp}`] ??= []).push(r);
    }
    const out = { at: new Map(), pills: [] };
    for (const [key, list] of Object.entries(byComp)) {
      const [mk, k] = key.split("|");
      list.sort((a, b) => a.arr - b.arr);
      const slots = this.slots[k] ?? [];
      const c = crowd(list, slots);
      c.list.forEach((r, i) => out.at.set(r.address, i < c.shown ? { pt: slots[i], hidden: false } : { pt: c.pillAt, hidden: true }));
      if (c.more && (S.machine === "all" || mk === S.machine)) out.pills.push({ comp: k, machine: mk, ...c });
    }
    return out;
  }

  startMove(cx, r, target) {
    const S = settings();
    const before = this.places(S).at.get(r.address)?.pt ?? this.slots[r.comp]?.[0];
    const fromComp = r.comp;
    r.comp = target;
    r.hist = prune([...(r.hist ?? []), { t: Date.now(), comp: target }], Date.now());
    r.arr = ++this.arrN;
    const after = this.places(S).at.get(r.address)?.pt ?? this.slots[target][0];
    const pts = route(this.board.comps, fromComp, before, target, after);
    const segs = plan(pts, S.motion);
    const id = ++this.moveN;
    r.moving = { id, segs, i: -1 };
    this.log.unshift({ t: new Date(), label: this.chipName(r, S), machine: r.machine, comp: target, detail: target === "post" && r.msg ? `"${r.msg}"` : activity(r) });
    if (this.log.length > 8) this.log.pop();
    // Render once with the first trace segment at zero length, then start.
    cx.timer.after(30, (cx) => this.advance(cx, r, id));
  }

  advance(cx, r, id) {
    const m = r.moving;
    if (!m || m.id !== id || !this.recs.has(r.address)) return;
    m.i++;
    if (m.i >= m.segs.length) {
      r.moving = null;
      r.arrivedAt = Date.now();
      if (settings().motion === "full" && m.segs.length > 1) {
        this.fading.push({ id, segs: m.segs, machine: machineKey(r) });
        cx.timer.after(700, (cx) => { this.fading = this.fading.filter((f) => f.id !== id); cx.notify(); });
      }
      cx.notify();
      return;
    }
    cx.notify();
    cx.timer.after(m.segs[m.i].d, (cx) => this.advance(cx, r, id));
  }

  /* ---------------- names ---------------- */

  /** How many cells a chip takes: room for a space name, or for an address. */
  chipCells(S = settings()) { return S.names === "space" ? 7 : 4; }

  /**
   * What a chip says. By space (the default): its space's name, cut to fit, with the tab's
   * number when another agent shares the space ("herdr 3"). By address: its terminal address
   * ("t3"). Sub-agents keep their address: they share their parent's space and tab.
   */
  chipName(r, S = settings()) {
    if (S.names !== "space" || r.parent || !r.space) return r.label.length < 5 ? r.label : r.label.slice(0, 4);
    const shared = [...this.recs.values()].some((x) => x !== r && !x.parent && x.spaceId === r.spaceId);
    const tab = shared ? /^(\d+)/.exec(r.tab ?? "")?.[1] ?? r.label : "";
    const room = 6 - (tab ? tab.length + 1 : 0);
    const name = [...r.space];
    const base = name.length > room ? name.slice(0, Math.max(1, room - 1)).join("") + "…" : r.space;
    return tab ? `${base} ${tab}` : base;
  }

  /* ---------------- actions ---------------- */

  /** Demo agents have no terminal: say so where you'll see it, instead of doing nothing. */
  demoOnly(r, what) {
    notify({ title: `${this.chipName(r)} is a demo agent`, body: `${what} needs a real terminal. Click here to turn demo off.`, level: "info", timeout: 4000, action: { name: `${MOD}.demo` } });
  }

  focusAgent(r) { if (this.demoOn) this.demoOnly(r, "Going to it"); else run("agent.focus", { terminal: r.address }); }
  /** Pins an agent's card open: its screen, and a box to message it. Real agents only take text when not blocked. */
  pinAgent(r, cx) {
    this.pin = r.address;
    this.menu = null;
    this.pill.pinned = null;
    this.syncCard(cx);
    if (this.isOpen(r.address) && this.canType(r)) cx.timer.after(30, () => this.msg.focus());
  }

  /** The agent whose card shows: the pinned one, else the chip under the pointer (board and iso). */
  cardTarget(S = settings()) {
    if (this.pin && this.recs.has(this.pin)) return this.pin;
    if (this.hover && S.labels !== "off" && S.view !== "scope" && S.machine !== "all" && this.recs.has(this.hover)) return this.hover;
    return null;
  }

  /** Keeps the card's screen reads on the agent it shows; another agent gets a fresh card. */
  syncCard(cx) {
    const addr = this.cardTarget();
    if (addr === this.cardFor) return;
    this.cardFor = addr;
    this.pinN++;
    this.msg.set_value(""); this.sent = null; this.screen = null; this.answering = null; this.pinAt = null; this.cardDrag = null; this.cardHover = false;
    if (addr && !this.demoOn) this.watchScreen(cx, addr, this.pinN);
  }

  /** Closes the card, pinned or hovered. `keyboard`: hand the keyboard back (Esc, ✕), not after a press elsewhere in Herdr. */
  closeCard(keyboard = false) {
    if (this.hover === this.cardFor) this.hover = null;
    this.pin = null; this.cardFor = null; this.pinAt = null; this.screen = null; this.cardHover = false; this.typing = false; this.pinN++;
    if (keyboard) this.focus.focus();
  }

  /** A hover card lasts only while the pointer is on its chip; clicking the chip keeps it. */
  hoverGone() { return !this.pin && !!this.hover && this.chipHover !== this.hover; }

  /** Each agent's card is collapsed unless you expanded that one. */
  isOpen(addr) { return (settings().expanded ?? []).includes(addr); }
  toggleOpen(addr) {
    const keep = (settings().expanded ?? []).filter((a) => a !== addr && this.recs.has(a));
    save({ expanded: this.isOpen(addr) ? keep : [...keep, addr] });
  }

  /** Whether the box can take text: not in demo, and when blocked only as an answer (see sendMsg). */
  canType(r) {
    if (this.demoOn) return false;
    if (r.status !== "blocked" || this.answering?.addr === r.address) return true;
    if (this.justAnswered(r.address)) return false;
    const scr = this.screen?.addr === r.address ? this.screen : null;
    return !!scr && scr.lines != null && !scr.prompt;
  }

  /** Rereads the pinned agent's screen every 1.2 s until the card closes or pins another. */
  watchScreen(cx, addr, n) {
    cx.spawn(async (cx) => {
      if (!(await this.loadScreen(addr, n))) return;
      cx.notify();
      cx.timer.after(1200, (cx) => this.watchScreen(cx, addr, n));
    });
  }

  /** Reads the agent's screen into the card; false once the card has closed or moved on. */
  async loadScreen(addr, n = this.pinN) {
    if (this.pinN !== n) return false;
    const text = await this.readScreen(addr);
    if (this.pinN !== n) return false;
    let prompt = text == null ? null : promptOptions(text);
    // The menu just answered may still be on its screen for a moment: don't offer it again.
    const d = this.answered;
    if (prompt && d?.addr === addr && d.key === promptKey(prompt) && Date.now() < d.until) prompt = null;
    // A blocked agent's menu is drawn as buttons, so the screen box shows what's above it.
    this.screen = { addr, lines: text == null ? null : screenTail(prompt ? prompt.above : text, 60), prompt };
    return true;
  }

  /** After an answer: forget its menu now, and read the screen again right away. */
  settle(addr, shown, cx) {
    this.answered = { addr, key: promptKey(shown), until: Date.now() + 4000 };
    if (this.screen?.addr === addr) this.screen = { ...this.screen, prompt: null };
    cx.spawn(async (cx) => { if (await this.loadScreen(addr)) cx.notify(); });
  }

  /** Answered a moment ago, and the agent may not have moved on yet. */
  justAnswered(addr) { return this.answered?.addr === addr && Date.now() < this.answered.until; }

  /** Whether an answer to this agent is on its way. */
  busy(addr) { return this.sent?.addr === addr && this.sent.state === "sending"; }

  /** The agent's screen as text, or null when it can't be read. */
  async readScreen(addr) {
    try {
      const res = await hc(["read", "--json", "--", addr]);
      if (res.code === 0) return JSON.parse(res.stdout).text ?? "";
    } catch (_e) { /* the terminal went away */ }
    return null;
  }

  /** Runs one hc command for the card; returns why it failed, or null. */
  async hcStep(args) {
    let res;
    try { res = await hc(args); } catch (e) { res = { code: 1, stdout: "", stderr: String(e) }; }
    return sendError(res);
  }

  /**
   * Is choice `o` of `shown` still on the agent's screen? The card's copy is up to a second old,
   * and a number pressed into a newer prompt would answer that one instead.
   */
  async stillShown(addr, shown, o) {
    const now = promptOptions(await this.readScreen(addr));
    return !!now && now.question === shown.question && now.options.some((x) => x.n === o.n && x.label === o.label);
  }

  /** The blocked agent's menu, as the card last read it. */
  promptOf(r) { return r.status === "blocked" && this.screen?.addr === r.address ? this.screen.prompt : null; }

  /** Picks choice `o` of a blocked agent's menu by pressing its number, as you would. */
  answerOption(r, o, cx) {
    const shown = this.promptOf(r);
    const addr = r.address;
    if (!shown || this.demoOn || this.busy(addr)) return;
    if (o.typed) { this.answering = { addr, n: o.n, label: o.label, shown }; this.msg.set_value(""); cx.timer.after(30, () => this.msg.focus()); return; }
    // Shown at once: the choice lights up and the others stop taking clicks until it's done.
    this.sent = { addr, state: "sending", text: `${o.n}. ${o.label}`, verb: "Picked", n: o.n };
    cx.spawn(async (cx) => {
      const err = !(await this.stillShown(addr, shown, o)) ? "its prompt changed; look again" : await this.hcStep(["keys", "--json", addr, String(o.n)]);
      this.sent = { addr, state: err ? "error" : "sent", text: `${o.n}. ${o.label}`, verb: "Picked", note: err };
      if (!err) this.settle(addr, shown, cx);
      cx.notify();
    });
  }

  /** Esc into the agent: cancels its prompt. */
  cancelPrompt(r, cx) {
    const addr = r.address;
    const shown = this.promptOf(r);
    if (this.busy(addr)) return;
    this.answering = null;
    this.sent = { addr, state: "sending", text: "Esc", verb: "Pressed" };
    cx.spawn(async (cx) => {
      const err = await this.hcStep(["keys", "--json", addr, "esc"]);
      this.sent = { addr, state: err ? "error" : "sent", text: "Esc", verb: "Pressed", note: err };
      if (!err && shown) this.settle(addr, shown, cx);
      cx.notify();
    });
  }

  /**
   * Sends the box's text to the pinned agent: Herdr pastes it and presses Enter. A blocked agent
   * takes text only as the answer to its "Type something." choice (picked first), or when its
   * screen shows no menu to pick from.
   */
  sendMsg(cx) {
    const r = this.recs.get(this.pin);
    const text = this.msg.value().trim();
    if (!r || !text || !this.canType(r) || this.busy(r.address)) return;
    const addr = r.address;
    const blocked = r.status === "blocked";
    const ans = blocked && this.answering?.addr === addr ? this.answering : null;
    if (blocked && !ans && this.promptOf(r)) return;
    this.sent = { addr, state: "sending", text, verb: ans ? "Answered" : "Sent" };
    cx.notify();
    cx.spawn(async (cx) => {
      let err = null;
      if (ans) {
        if (!(await this.stillShown(addr, ans.shown, ans))) err = "its prompt changed; look again";
        else err = await this.hcStep(["keys", "--json", addr, String(ans.n)]);
        // The choice opens a text field; give it a moment before pasting into it.
        if (!err) await new Promise((ok) => cx.timer.after(400, ok));
      }
      if (!err) err = await this.hcStep(["send", "--json", ...(blocked ? ["--force"] : []), "--", addr, text]);
      this.sent = { addr, state: err ? "error" : "sent", text, verb: ans ? "Answered" : "Sent", note: err };
      if (!err) {
        this.answering = null;
        if (ans) this.settle(addr, ans.shown, cx);
        if (this.pin === addr && this.msg.value().trim() === text) this.msg.set_value("");
      }
      cx.notify();
    });
  }

  /** Ends a card drag that lost its release (let go outside the board): the next press ends it. */
  endCardDrag() { if (this.cardDrag) { this.cardDrag = null; } }

  /** Starts moving the pinned card (its header) or resizing it (its corner). */
  startCardDrag(mode, e, cx) {
    cx.stop_propagation();
    if (mode === "move" && !this.pin) this.pin = this.cardFor;
    const S = settings();
    this.cardDrag = { mode, x0: e.position.x, y0: e.position.y, at: { ...(this.pinAt ?? { x: 0, y: 0 }) }, w: S.cardW, h: S.cardH };
    cx.notify();
  }

  /* ---------------- drawing: board ---------------- */

  /** Built vector paths are immutable and cached; elements are rebuilt every render. */
  paths(P, cw, ch) {
    const key = `${cw.toFixed(3)}|${ch.toFixed(3)}|${settings().theme}|${this.themeRev}|${this.boardKey}|${P.bg}|${P.frame}`;
    if (key !== this.pathsKey) { this.pathList = this.buildPaths(P, cw, ch); this.pathsKey = key; }
    return this.pathList.map(({ path, color }) => div().absolute().left(0).top(0).w(W * cw).h(H * ch).child(window.paint_path(path, color)));
  }

  buildPaths(P, cw, ch) {
    const X = (x) => (x + 0.5) * cw, Y = (y) => (y + 0.5) * ch;
    const sx = (x, odd) => Math.round(X(x)) + (odd ? 0.5 : 0), sy = (y, odd) => Math.round(Y(y)) + (odd ? 0.5 : 0);
    const groups = new Map();
    const add = (color, width, fn) => {
      const k = `${color}|${width}`;
      if (!groups.has(k)) groups.set(k, { color, width, ops: [] });
      groups.get(k).ops.push(fn);
    };
    const colorOf = (cls) => P[cls] ?? P.frame;
    const rect = (r, odd) => (b) => {
      const x0 = sx(r.x0, odd), y0 = sy(r.y0, odd), x1 = sx(r.x1, odd), y1 = sy(r.y1, odd);
      if (!r.gap) { b.move_to(x0, y0).line_to(x1, y0).line_to(x1, y1).line_to(x0, y1).close(); return; }
      const ga = X(r.gap[0]) - cw * 0.55, gb = X(r.gap[1]) + cw * 0.55;
      b.move_to(ga, y0).line_to(x0, y0).line_to(x0, y1).line_to(x1, y1).line_to(x1, y0).line_to(gb, y0);
    };
    const poly = (l, odd) => (b) => { l.pts.forEach(([x, y], i) => (i ? b.line_to(sx(x, odd), sy(y, odd)) : b.move_to(sx(x, odd), sy(y, odd)))); };
    // Single traces under the double buses, so a bus's hollow core hides where they meet.
    for (const l of this.board.lines.filter((l) => !l.dbl)) add(colorOf(l.cls), 1, poly(l, true));
    const doubles = [];
    for (const l of this.board.lines.filter((l) => l.dbl)) doubles.push({ color: colorOf(l.cls), fn: poly(l, false) });
    for (const r of this.board.rects) {
      if (r.dbl) doubles.push({ color: colorOf(r.cls), fn: rect(r, false) });
      else add(colorOf(r.cls), 1, rect(r, true));
    }
    const out = [];
    for (const g of groups.values()) {
      const b = PathBuilder.stroke(g.width);
      for (const fn of g.ops) fn(b);
      out.push({ path: b.build(), color: g.color });
    }
    for (const d of doubles) {
      const outer = PathBuilder.stroke(4); d.fn(outer);
      const inner = PathBuilder.stroke(2); d.fn(inner);
      out.push({ path: outer.build(), color: d.color }, { path: inner.build(), color: P.bg });
    }
    return out;
  }

  textEls(P, fs, cw, ch, fanMs) {
    const out = [];
    const color = (cls) => {
      const k = cls.split(" ")[0];
      return { frame: P.frame, silk: P.silk, dim: P.dim, vrm: P.cpu, vrm2: P.cpu, xtal: P.tpm, fan: P.cpu, led: P.led }[k] ?? P[k] ?? P.text;
    };
    for (const t of this.board.text) {
      const runs = [];
      let run = "", start = t.x, col = t.x;
      const flush = () => { if (run.trim()) runs.push({ x: start, s: run, g: false }); run = ""; };
      for (const ch of [...t.s]) {
        if (!safeGlyph(ch)) { flush(); if (ch.trim()) runs.push({ x: col, s: ch, g: true }); start = col + 1; }
        else { if (!run) start = col; run += ch; }
        col++;
      }
      flush();
      for (const r of runs) {
        let e = div().absolute().left(r.x * cw).top(t.y * ch).h(ch).text_size(fs).line_height(`${ch}px`).whitespace_nowrap().text_color(color(t.cls));
        if (r.g) e = e.w(cw).flex().justify_center();
        if (t.cls.includes("title")) e = e.font_weight(700);
        if (t.cls === "vrm") e = e.loop("opacity", { from: 0.35, to: 0.9, period: 1600 });
        if (t.cls === "vrm2") e = e.loop("opacity", { from: 0.9, to: 0.35, period: 1600 });
        if (t.cls === "xtal") e = e.loop("opacity", { from: 0.2, to: 1, period: 1000 });
        if (t.cls === "led") e = e.loop("opacity", { from: 0.35, to: 1, period: 3000 });
        if (t.cls === "fan") e = e.frames(FAN, fanMs);
        out.push(e.child(t.cls === "fan" ? FAN[0] : r.s));
      }
    }
    return out;
  }

  trailEls(P, cw, ch, S) {
    if (S.motion !== "full") return [];
    const X = (x) => (x + 0.5) * cw, Y = (y) => (y + 0.5) * ch;
    const out = [];
    const seg = (id, k, s, state) => {
      const [x0, y0] = s.from, [x1, y1] = s.to;
      const horiz = y0 === y1;
      const a = horiz ? X(x0) : Y(y0), b = horiz ? X(x1) : Y(y1);
      const full = state !== "armed";
      const lo = full ? Math.min(a, b) : a, len = full ? Math.abs(b - a) + 2 : 0;
      const across = horiz ? Y(y0) : X(x0);
      const d = state === "live" ? s.d : 0;
      for (const [w, op, tag] of [[6, 0.22, "g"], [2, 1, "c"]]) {
        let e = div().id(`tr-${id}-${k}-${tag}`).absolute().bg(P.lit).rounded(w / 2);
        e = horiz ? e.left(lo - (full ? 1 : 0)).top(across - w / 2).w(len).h(w) : e.top(lo - (full ? 1 : 0)).left(across - w / 2).h(len).w(w);
        e = e.transition(horiz ? "left" : "top", { duration: d, easing: "linear" }).transition(horiz ? "width" : "height", { duration: d, easing: "linear" })
          .transition("opacity", { duration: 550, easing: "ease-out" }).opacity(state === "spent" ? 0 : op);
        out.push(e);
      }
    };
    for (const r of this.recs.values()) {
      const m = r.moving;
      if (!m || m.segs.length < 2 || !this.visible(r, S)) continue;
      m.segs.forEach((s, k) => {
        if (k < m.i) seg(m.id, k, s, "spent");
        else if (k === m.i) seg(m.id, k, s, "live");
        else if (k === m.i + 1) seg(m.id, k, s, "armed");
      });
    }
    for (const f of this.fading) if (f.machine === S.machine) f.segs.forEach((s, k) => seg(f.id, k, s, "spent"));
    return out;
  }

  /** Where a chip is drawn: its spot, or the end of the bus segment it's on while it moves. */
  chipPt(r, at) {
    const m = r.moving;
    if (!m) return at?.pt ?? null;
    const s = m.i < 0 ? m.segs[0].from : m.segs[m.i].to;
    return { x: s[0], y: s[1] };
  }

  chipEl(r, at, P, S, fs, cw, ch, proj) {
    let d = 300, ease = "ease-out";
    const m = r.moving;
    const pt = this.chipPt(r, at);
    if (m) {
      if (m.i < 0) d = 0;
      else { const s = m.segs[m.i]; d = s.d; ease = s.straight ? "ease-in-out" : "linear"; }
    }
    if (this.instant || S.motion === "off") d = 0;
    const { bg: tile, fg } = chipColors(r, P);
    const led = { working: P.working, blocked: P.bios, done: P.post, error: P.fault }[r.status] ?? P.dim;
    const cells = this.chipCells(S);
    const w = cells * cw;
    const q = proj(pt);
    let e = div().id(`chip-${r.address}`).absolute().left((q.x + 0.5 - cells / 2) * cw).top(q.y * ch).w(w).h(ch)
      .transition("left", { duration: d, easing: ease }).transition("top", { duration: d, easing: ease })
      .flex().items_center().justify_center().rounded(3).bg(tile).text_color(fg).text_size(fs).line_height(`${ch}px`).font_weight(r.parent ? 600 : 700)
      .cursor_pointer()
      // The card opens when the pointer moves onto the chip, not when a moving chip slides under a
      // pointer at rest: chips travel all the time. Chips under the open card still hear the pointer
      // (nothing here blocks it), so they ignore it while it's on the card.
      .on_hover((h, cx) => {
        if (h) { if (!this.cardHover) this.chipHover = r.address; }
        else if (this.chipHover === r.address) { this.chipHover = null; if (this.hoverGone()) { this.hover = null; this.syncCard(cx); } }
        cx.notify();
      })
      .on_mouse_move((_m, cx) => { if (this.hover !== r.address && !this.cardHover) { this.chipHover = this.hover = r.address; this.syncCard(cx); cx.notify(); } })
      // Pinned on press, not on click: while the button is down the chip doesn't count as hovered,
      // so waiting for the click let the hover card close and a new one open.
      .on_mouse_down("left", (e, cx) => { this.press(e, cx); this.pinAgent(r, cx); cx.notify(); })
      .on_click((e, cx) => { if (e.click_count >= 2) { this.focusAgent(r); cx.notify(); } });
    if (P.agentRing) e = e.border_1().border_color(P.agentRing);
    if ((r.status === "idle" || !r.status) && this.hover !== r.address) e = e.opacity(0.5);
    if (r.status === "blocked") e = e.border_2().border_color(P.bios);
    if (r.status === "error") e = e.border_2().border_color(P.fault);
    if (this.hover === r.address || this.selAddr === r.address) e = e.border_2().border_color(P.lit);
    e = e.child(div().absolute().left(0).top(0).bottom(0).w(Math.max(3, Math.round(cw * 0.42))).rounded_l(3).bg(this.spaceTint(r)));
    e = e.child(div().pl(Math.max(3, Math.round(cw * 0.42))).whitespace_nowrap().overflow_hidden().child(this.chipName(r, S)));
    let dot = div().absolute().top(-3).right(-3).w(7).h(7).rounded(4).bg(led).border_1().border_color(P.bg);
    if (r.status === "working") dot = dot.loop("opacity", { from: 0.3, to: 1, period: 1100 });
    if (r.status === "blocked") dot = dot.loop("opacity", { from: 0.1, to: 1, period: 500 });
    e = e.child(dot);
    if (r.status === "blocked") e = e.child(div().absolute().left(-6).top(-6).w(w + 12).h(ch + 12).rounded(6).border_1().border_color(P.bios).loop("opacity", { from: 0, to: 0.9, period: 1100 }));
    if (r.focused) e = e.child(div().absolute().left(-cw).top(0).text_color(P.text).child("▸"));
    if (r.progress != null && r.status === "working") e = e.child(div().absolute().left(0).bottom(-3).h(2).w((w * Math.min(100, r.progress)) / 100).bg(P.lit).transition("width", 600));
    if (S.labels === "short" && !m) {
      const tw = (at?.pt?.tw ?? 5) * cw;
      e = e.child(div().absolute().left(0).top(ch).max_w(tw).text_size(fs * 0.7).line_height(`${fs}px`).px(2).rounded(2).bg(alpha(P.bg, "e6")).text_color(P.text).font_weight(500).truncate()
        .child(`${r.space ?? r.tab ?? ""} · ${r.status === "working" ? activity(r) : r.msg ?? activity(r)}`));
    }
    return e;
  }

  /* ---------------- menus ---------------- */

  /** Each header menu's contents, by name: functions, so only the open one is built. */
  menus(P, S, recs, bodyH) {
    const maxH = Math.max(160, bodyH + 60);
    const title = (t, right) => h_flex().px(4).py(2).justify_between().text_size(10.5).child(div().text_color(P.dim).child(t)).when(!!right, (e) => e.child(right));
    const rule = () => div().h(1).my(3).mx(4).bg(P.cardLine);
    const item = (id, label, sub, on, fn, labelW = 72) => h_flex().id(id).flex_none().h(26).items_center().gap(8).px(6).rounded(4).cursor_pointer()
      .when(on, (e) => e.bg(alpha(P.lit, "14"))).hover((e) => e.bg(alpha(P.lit, "24")))
      .on_click((_e, cx) => { fn(cx); cx.notify(); })
      .child(div().w(12).flex_none().text_color(P.lit).child(on ? "●" : ""))
      .child(div().w(labelW).flex_none().truncate().font_weight(on ? 700 : 400).child(label))
      .child(div().flex_1().min_w(0).truncate().text_color(P.dim).child(sub ?? ""));
    /** A menu whose list may be taller than the window: a scroll list needs a definite height. */
    const scroll = (w, h, box) => div().w(w).h(Math.min(maxH, h)).child(box.size_full().overflow_y_scrollbar());
    const choice = (key, head, opts) => () => this.menuBox(`menu-${key}`, P).w(380).p(6).gap(2).child(title(head))
      .children(opts.map(([v, sub]) => item(`${key}-${v}`, v, sub, S[key] === v, () => { save({ [key]: v }); this.instant = true; this.menu = null; }, 60)));
    return {
      view: () => choice("view", "VIEW", VIEWS)()
        .child(rule())
        .child(h_flex().px(6).py(2).gap(6).items_center().child(div().flex_1().text_color(P.muted).child("scope span"))
          .children(SPANS.map((ms) => this.btn(`span-${ms}`, spanLabel(ms), P, () => save({ span: ms }), S.span === ms, 3)))),
      labels: choice("labels", "LABELS", [["hover", "a card when you point at an agent"], ["short", "space and activity under each agent"], ["full", "plus a list of every agent"], ["off", "nothing extra"]]),
      motion: choice("motion", "MOTION", [["full", "agents walk the buses, trails light up"], ["reduced", "agents slide straight there"], ["off", "agents jump"]]),
      spaces: () => {
        const cur = focused()?.space;
        const sel = S.spaces;
        const list = this.spaceList();
        const all = list.map((x) => x.id);
        const on = (id) => !sel || (sel === "current" ? id === cur : sel.includes(id));
        const toggle = (id) => {
          const base = all.filter(on);
          const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
          save({ spaces: next.length === all.length ? null : next });
        };
        const shown = all.filter(on).length;
        const box = (yes) => div().flex_none().size(14).rounded(3).border_1().border_color(yes ? P.lit : P.dim).when(yes, (e) => e.bg(P.lit))
          .flex().items_center().justify_center().text_size(10).font_weight(700).text_color(P.bg).child(yes ? "✓" : "");
        return scroll(300, 96 + list.length * 28, this.menuBox("menu-spaces", P).p(6).gap(2)
          .child(title("SHOW AGENTS FROM", div().text_color(shown ? P.text : P.bios).child(shown === all.length ? `all ${all.length} spaces` : `${shown} of ${all.length} spaces`)))
          .child(h_flex().gap(6).px(4).pb(4)
            .child(this.btn("f-all", "All", P, () => save({ spaces: null }), !sel))
            .child(this.btn("f-none", "None", P, () => save({ spaces: [] }), Array.isArray(sel) && sel.length === 0))
            .child(this.btn("f-cur", "This space", P, () => save({ spaces: "current" }), sel === "current")))
          .child(rule())
          .when(list.length === 0, (e) => e.child(div().px(4).py(2).text_color(P.dim).child("No spaces yet.")))
          .children(list.map((x) => {
            const yes = on(x.id);
            const n = recs.filter((r) => !r.parent && r.spaceId === x.id).length;
            return h_flex().id(`sp-${x.id}`).flex_none().h(26).items_center().gap(8).px(6).rounded(4).cursor_pointer()
              .when(yes, (e) => e.bg(alpha(P.lit, "14"))).hover((e) => e.bg(alpha(P.lit, yes ? "24" : "0c")))
              .on_click((_e, cx) => { toggle(x.id); cx.notify(); })
              .child(box(yes))
              .child(div().opacity(yes ? 1 : 0.4).child(this.avatar({ spaceId: x.id, space: x.name }, 16)))
              .child(div().flex_1().truncate().text_color(yes ? P.text : P.dim).font_weight(yes ? 600 : 400).child(x.name))
              .when(!!x.machine, (e) => e.child(div().text_color(yes ? P.remote : P.dim).child(x.machine)))
              .when(x.id === cur, (e) => e.child(div().text_color(P.dim).child("this space")))
              .child(div().w(18).flex().justify_end().text_color(yes && n ? P.text : P.dim).child(String(n)));
          })));
      },
      themes: () => {
        const ids = themeOrder(this.themeDefs);
        const notes = [...this.themeErrors, ...P.warnings];
        const cur = this.themeDefs.has(S.theme) ? S.theme : DEFAULT_THEME;
        return scroll(320, 76 + (ids.length + 2) * 26 + notes.length * 52, this.menuBox("menu-themes", P).p(6).gap(2)
          .child(title("THEME"))
          .children(ids.map((id) => item(`th-${id}`, this.themeDefs.get(id).name, `${id}.json`, id === cur, () => { save({ theme: id }); this.menu = null; }, 110)))
          .child(rule())
          .child(item("th-copy", "Copy to a new theme", "", false, () => this.copyTheme(P), 200))
          .child(item("th-dir", "Open themes folder", "", false, () => { const [cmd, args] = openCommand(PLATFORM, THEME_DIR()); exec(cmd, args).catch(() => {}); }, 200))
          .children(notes.map((n) => div().px(4).py(2).text_size(11).text_color(P.bios).child("⚠ " + n))));
      },
      legend: () => {
        const rows = [["CPU", "cpu", "thinking"], ["PCH", "pch", "running a command"], ["NIC", "nic", "network command (curl, gh, git, ssh…)"], ["NVMe", "nvme", "files changing in its repo"],
          ["PCIe", "gpu", "sub-agents"], ["BIOS", "bios", "needs your permission"], ["F_PANEL", "panel", "asked you a question"], ["TPM", "tpm", "needs a login"], ["FAULT", "fault", "error"],
          ["POST", "post", "finished while you were away"], ["RAM", "ram", "idle"]];
        return this.menuBox("menu-legend", P).w(380).p(8).gap(2)
          .child(div().text_size(10.5).text_color(P.dim).pb(2).child("LEGEND · keys: v view · n names · l labels · m motion · z size · d demo · a all machines · r open a card · 1–9 answer · c f s t ← → ⏎ esc"))
          .children(rows.map(([l, role, d]) => h_flex().gap(10).items_start().child(div().w(64).flex_none().font_weight(700).text_color(P[role]).child(l)).child(div().flex_1().min_w(0).text_color(P.muted).child(d))))
          .child(h_flex().gap(10).items_start().pt(4).mt(2).border_t(1).border_color(P.line)
            .child(div().w(64).flex_none().child(div().relative().w(34).pl(8).pr(4).rounded(3).bg(P.programs.claude ?? P.lit).text_color(P.agentFg).font_weight(700).child("t1")
              .child(div().absolute().left(0).top(0).bottom(0).w(4).rounded_l(3).bg(MARK.ansi6))))
            .child(div().flex_1().min_w(0).text_color(P.muted).child("agent: its space's name (or its terminal's address). Its color is the program; the stripe is its space's color, as in the sidebar.")));
      },
    };
  }

  /* ---------------- drawing: isometric ---------------- */

  isoEls(P, fs, cw, ch, recs, S, fanMs) {
    const out = this.isoRuns.map((r) => {
      let e = div().absolute().left(r.x * cw).top(r.y * ch).w(r.s.length * cw).h(ch).text_size(fs).line_height(`${ch}px`).whitespace_nowrap().text_color(spec(P, r.fg));
      if (r.bg) e = e.bg(spec(P, r.bg));
      return e.child(r.s);
    });
    for (const [k, b] of Object.entries(this.iso.boxes)) {
      if (!recs.some((r) => r.comp === k && !r.moving && this.visible(r, S))) continue;
      const role = this.board.comps[k].role;
      out.push(div().absolute().left((b.L + 1) * cw).top((b.T + 1) * ch).w((b.R - b.L - 1) * cw).h((b.z - 1) * ch + ch * 0.85).bg(alpha(P[role], "30"))
        .loop("opacity", { from: 0.15, to: 0.9, period: ALERT.has(k) ? 900 : 2800 }));
    }
    const cpu = this.iso.boxes.cpu0;
    if (cpu) out.push(div().absolute().left((cpu.R - 4) * cw).top((cpu.T - 1) * ch).w(3 * cw).h(ch).flex().justify_between().text_size(fs).line_height(`${ch}px`).text_color(P.cpu).font_weight(700)
      .child("(").child(div().frames(SPIN, fanMs).child(SPIN[0])).child(")"));
    return out;
  }

  isoTrailEls(P, fs, cw, ch, S) {
    if (S.motion !== "full") return [];
    const out = [];
    const seg = (id, k, s, state) => {
      const cells = isoTrail(this.iso.at, s.from, s.to);
      out.push(div().id(`it-${id}-${k}`).absolute().left(0).top(0).w(this.iso.w * cw).h(this.iso.h * ch).text_size(fs).line_height(`${ch}px`)
        .opacity(state === "live" ? 1 : 0).transition("opacity", { duration: state === "live" ? Math.min(220, s.d) : 650, easing: "ease-out" })
        .children(cells.map((c) => div().absolute().left(c.x * cw).top(c.y * ch).w(cw).h(ch).flex().justify_center().bg(alpha(P.lit, "26")).text_color(P.lit).font_weight(700).child(c.c))));
    };
    for (const r of this.recs.values()) {
      const m = r.moving;
      if (!m || m.segs.length < 2 || !this.visible(r, S)) continue;
      m.segs.forEach((s, k) => {
        if (k < m.i) seg(m.id, k, s, "spent");
        else if (k === m.i) seg(m.id, k, s, "live");
        else if (k === m.i + 1) seg(m.id, k, s, "armed");
      });
    }
    for (const f of this.fading) if (f.machine === S.machine) f.segs.forEach((s, k) => seg(f.id, k, s, "spent"));
    return out;
  }

  /* ---------------- drawing: scope ---------------- */

  scopeView(P, S, width) {
    const now = Date.now();
    const fs = 12, cw = fs * ADV, ch = Math.round(fs * 1.3);
    const LW = 26;
    const cols = Math.max(20, Math.floor((width - 28) / cw) - LW - 2);
    const span = S.span;
    const roleOf = (comp) => this.board.comps[comp]?.role ?? "dim";
    const vis = [...this.recs.values()].filter((r) => this.visible(r, S));
    const byLabel = (a, b) => a.label.localeCompare(b.label, undefined, { numeric: true });
    const order = [];
    for (const p of vis.filter((r) => !r.parent || !vis.some((x) => x.address === r.parent)).sort(byLabel)) {
      order.push(p);
      order.push(...vis.filter((r) => r.parent === p.address).sort(byLabel));
    }
    const fullW = (LW + cols + 2) * cw;
    const at = (c) => clock(new Date(now - span + (c * span) / cols));
    const tks = ticks(span, cols);
    const grid = tks.map((t) => div().absolute().left((LW + t.x) * cw + cw / 2).top(0).bottom(0).w(1).bg(alpha(P.line, "aa")));
    const axis = div().relative().flex_none().h(ch + 4).w(fullW).text_size(11).text_color(P.dim)
      .child(div().absolute().left(0).child(`last ${spanLabel(span)} · ${order.length} channel${order.length === 1 ? "" : "s"}`))
      .children(tks.map((t) => div().absolute().left((LW + t.x) * cw - 2.5 * cw).w(6 * cw).flex().justify_center().child(t.label)))
      .child(div().absolute().left((LW + cols - 2) * cw).text_color(P.text).child("now"));
    const channel = (r) => {
      const states = sample(r.hist ?? [], now, span, cols);
      const wv = wave(states);
      const { bg, fg } = chipColors(r, P);
      const st = { working: P.working, blocked: P.bios, done: P.post, error: P.fault }[r.status] ?? P.dim;
      const runEls = (runs, top) => runs.map((u) => div().absolute().left((LW + u.x) * cw).top(top).h(ch).line_height(`${ch}px`).whitespace_nowrap()
        .text_color(P[roleOf(u.comp)] ?? P.dim).font_weight(level(u.comp) >= 2 ? 700 : 400).child(u.s));
      const tips = wv.segs.map((g) => div().id(`seg-${r.address}-${g.from}`).absolute().left((LW + g.from) * cw).top(0).w((g.to - g.from + 1) * cw).h(2 * ch)
        .tooltip(`${LABEL[g.comp] ?? g.comp} · ${fmtDur(((g.to - g.from + 1) * span) / cols)} · ${at(g.from)}–${g.to === cols - 1 ? "now" : at(g.to + 1)}`));
      const cur = r.comp;
      const sel = this.hover === r.address;
      return div().id(`ch-${r.address}`).relative().flex_none().h(2 * ch + 8).w(fullW).text_size(fs).rounded(4)
        .when(sel, (e) => e.bg(alpha(P.lit, "12")))
        .hover((e) => e.bg(alpha(P.lit, "0c")))
        .on_hover((h, cx) => { if (h) this.hover = r.address; else if (this.hover === r.address) this.hover = null; cx.notify(); })
        .on_mouse_down("left", this.press).on_click((e, cx) => { if (e.click_count >= 2) this.focusAgent(r); else this.pinAgent(r, cx); cx.notify(); })
        .child(h_flex().absolute().left(r.parent ? 2 * cw : 0).top(0).h(2 * ch).w((LW - 1 - (r.parent ? 2 : 0)) * cw).gap(6).items_center()
          .when(!!r.parent, (e) => e.child(div().text_color(P.dim).child("`-")))
          .child(this.avatar(r, 14))
          .child(div().px(4).rounded(3).bg(bg).text_color(fg).font_weight(700).whitespace_nowrap().child(this.chipName(r, S)))
          .child(v_flex().flex_1().min_w(0).text_size(10.5).line_height("13px")
            .child(div().truncate().text_color(P.text).child(r.parent ? r.title || "sub-agent" : S.names === "space" && r.space ? r.label : r.space ?? r.tab ?? "—"))
            .child(div().truncate().text_color(st).child(r.status ?? "no status"))))
        .children(runEls(wv.hi, 0)).children(runEls(wv.lo, ch)).children(tips)
        .when(!!cur, (e) => e.child(div().absolute().left((LW + cols) * cw + 2).top(level(cur) === 1 ? ch + 2 : 2).w(cw * 0.7).h(ch - 4).rounded(1)
          .bg(P[roleOf(cur)] ?? P.dim).loop("opacity", { from: 0.25, to: 1, period: r.status === "working" ? 700 : r.status === "blocked" ? 450 : 2200 })));
    };
    return v_flex().id("scope").size_full().px(14).pt(10).overflow_y_scrollbar()
      .child(axis)
      .child(div().relative().flex_none().w(fullW).h(order.length ? order.length * (2 * ch + 10) : 0).children(grid)
        .child(v_flex().absolute().left(0).top(0).gap(2).children(order.map(channel))))
      .when(order.length === 0, (e) => e.child(div().py(16).text_size(12).text_color(P.dim).child("No agents on this machine.")))
      .child(v_flex().flex_none().pt(10).pb(12).gap(4).text_size(11)
        .child(h_flex().flex_wrap().gap(14).children(Object.keys(MEANS).map((k) => h_flex().gap(5)
          .child(div().font_weight(700).text_color(P[this.board.comps[k]?.role] ?? P.dim).child(LABEL[k])).child(div().text_color(P.muted).child(MEANS[k])))))
        .child(div().text_color(P.dim).child("raised: working · low: idle or done · xxx: needs you or failed · traces start when the board first sees an agent")));
  }

  /** The color of the space an agent belongs to, as the sidebar shows it. */
  spaceTint(r) {
    const t = this.t ?? {};
    if (!r.spaceId || r.space === "~") return t.dim ?? "#808080";
    let c = this.spaceColors?.[r.spaceId];
    if (!c && this.demoOn) c = PROJECT_COLORS[Math.max(0, this.demo.spaces().findIndex((s) => s.id === r.spaceId)) % PROJECT_COLORS.length];
    if (!c) return t.dim ?? "#808080";
    return c.startsWith("#") ? c : MARK[c] ?? t[c] ?? t.dim;
  }

  /** The sidebar's space avatar: its color with the first letter of its name. */
  avatar(r, size) {
    return h_flex().flex_none().size(size).rounded(Math.round(size * 0.28)).bg(this.spaceTint(r)).items_center().justify_center()
      .text_size(Math.round(size * 0.58)).font_weight(700).text_color("#ffffff").child(([...(r.space ?? "")][0] ?? "?").toUpperCase());
  }

  /** An agent's details. Pinned (clicked), it also shows its screen and a box to message it. */
  card(r, P, pinned = false) {
    const parent = r.parent ? this.recs.get(r.parent) : null;
    const st = { working: P.working, blocked: P.bios, done: P.post, error: P.fault }[r.status] ?? P.dim;
    const line = (txt, color, extra = (e) => e) => extra(div().flex_none().text_color(color).child(txt));
    const sz = pinned ? this.cardSize() : null;
    const card = v_flex().w(pinned ? sz.w : 340).p(10).gap(2).bg(P.card).border_1().border_color(pinned ? P.lit : P.cardLine).rounded(6).shadow_lg().text_size(12)
      .when(pinned, (e) => e.relative()).when(pinned && this.isOpen(r.address), (e) => e.h(sz.h).overflow_hidden())
      // Pinned, the header moves the card; a double-click puts it back beside the chip.
      .child(h_flex().id("card-head").flex_none().justify_between().gap(10)
        .when(pinned, (e) => e.cursor_grab().on_mouse_down("left", (ev, cx) => this.startCardDrag("move", ev, cx))
          .on_click((ev, cx) => { if (ev.click_count >= 2) { this.pinAt = null; cx.notify(); } }))
        .child(div().font_weight(700).child(`${r.label} · ${r.program?.name ?? r.app ?? "agent"}`))
        .child(h_flex().gap(8).items_center()
          .child(div().text_color(st).child(`${r.status ?? "no status"} ${fmtDur(Date.now() - r.since)}`))
          .when(pinned, (e) => e.child(div().id("pin-close").px(4).rounded(3).text_color(P.dim).cursor_pointer().hover((x) => x.text_color(P.text).bg(P.head))
            .on_mouse_down("left", this.press).on_click((_e, cx) => { this.closeCard(true); cx.notify(); }).child("✕")))))
      .child(h_flex().flex_none().gap(6).items_center().min_w(0)
        .when(!!r.space, (e) => e.child(this.avatar(r, 15)).child(div().flex_none().text_color(P.text).child(r.space)).child(div().text_color(P.dim).child("·")))
        .child(div().truncate().text_color(P.muted).child(`${r.remote ? r.machine : this.demoOn ? DEMO_HERE : this.localName}${parent ? ` · sub-agent of ${parent.label}` : ""}`)))
      .when(!!r.title, (e) => e.child(line(r.title, P.text, (x) => x.font_weight(600))))
      .when(!!r.msg, (e) => e.child(line(`"${r.msg}"`, P.muted, (x) => x.italic())))
      .child(line(`▸ ${r.status ? activity(r) : "hasn't reported a status to Herdr yet"}`, P.lit))
      .when(!!r.cwd, (e) => e.child(line((inside(r.cwd, home(), PLATFORM) != null ? "~/" + inside(r.cwd, home(), PLATFORM) : normPath(r.cwd)), P.dim, (x) => x.truncate())))
      .when(r.progress != null, (e) => e.child(line(`progress ${r.progress}%`, P.dim)))
      .when(!this.demoOn && !!why(r, parent?.label), (e) => e.child(div().flex_none().mt(4).pt(4).border_t(1).border_color(P.line).text_color(P.dim).text_size(11)
        .child(why(r, parent?.label))));
    return pinned ? this.compose(card, r, P) : card;
  }

  /** The pinned card's size: as saved, or as it's being dragged. */
  cardSize() {
    const d = this.cardDrag, S = settings();
    return d?.mode === "size" ? { w: d.w, h: d.h } : { w: S.cardW, h: S.cardH };
  }

  /**
   * The pinned card's lower half: the agent's screen (its bottom, as much as fits), then either a
   * box to message it or, when it's blocked, the choices its prompt offers, then where to go next.
   */
  compose(card, r, P) {
    const scr = this.screen?.addr === r.address ? this.screen : null;
    const lines = this.demoOn ? ["(a demo agent has no screen)"] : !scr ? ["reading its screen…"] : scr.lines == null ? ["(can't read its screen)"] : scr.lines.length ? scr.lines : ["(its screen is empty)"];
    const sent = this.sent?.addr === r.address ? this.sent : null;
    const blocked = r.status === "blocked" && !this.demoOn;
    const prompt = this.promptOf(r);
    const ans = this.answering?.addr === r.address ? this.answering : null;
    const asks = r.kind === "question" ? "It asked you a question" : r.kind === "auth" ? "It needs you to log in" : "It's asking for your permission";
    const input = () => h_flex().flex_none().gap(6).items_center()
      .child(div().id("pin-input").flex_1().min_w(0).h(30).px(8).flex().items_center().rounded(5).border_1().border_color(this.typing ? P.lit : P.cardLine).bg(P.bg).cursor_text()
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .child(Input.new(this.msg).w_full().text_size(12).text_color(P.text)))
      .child(this.btn("pin-send", sent?.state === "sending" ? "Sending" : "Send ⏎", P, (cx) => this.sendMsg(cx), false, 7));
    // While a pick is on its way, it stays lit and the others stop taking clicks.
    const busy = this.busy(r.address);
    const choice = (o) => {
      const lit = ans?.n === o.n || (busy && sent?.n === o.n);
      return h_flex().id(`opt-${o.n}`).flex_none().h(24).gap(8).px(6).items_center().rounded(4)
        .border_1().border_color(lit ? P.lit : P.cardLine).bg(lit ? alpha(P.lit, "24") : P.bg).opacity(busy && !lit ? 0.45 : 1)
        .when(!busy, (e) => e.cursor_pointer().hover((x) => x.border_color(P.lit).bg(alpha(P.lit, "18"))))
        .on_mouse_down("left", this.press).on_click((_e, cx) => { this.answerOption(r, o, cx); cx.notify(); })
      .child(div().flex_none().w(16).text_color(P.lit).font_weight(700).child(String(o.n)))
      .child(div().flex_1().min_w(0).truncate().text_color(P.text).child(o.label));
    };
    let lower;
    if (this.demoOn) lower = div().flex_none().px(8).py(6).rounded(5).border_1().border_color(P.cardLine).text_size(11.5).text_color(P.dim)
      .child("Demo agents can't take messages. Press d to turn demo off.");
    else if (!blocked) lower = input();
    else {
      // Its own question when the screen has one; else what it told Herdr.
      const q = prompt?.question ?? r.msg;
      // Answered a moment ago: it's still blocked until it redraws, so say so instead of a box.
      if (!prompt && this.justAnswered(r.address) && !ans) lower = div().flex_none().text_size(11.5).text_color(P.dim).child("Answered. Waiting for it to go on…");
      else lower = v_flex().flex_none().gap(4)
        .child(div().text_size(11.5).text_color(P.bios).font_weight(700).child(asks + (prompt ? ": press a choice, or its number" : "")))
        .when(!!q, (e) => e.child(div().text_size(12).text_color(P.text).child(q.length > 160 ? q.slice(0, 159) + "…" : q)))
        .when(!!prompt, (e) => e.children(prompt.options.map(choice)))
        .when(!!ans, (e) => e.child(div().text_size(11).text_color(P.dim).child(`Your answer for "${ans.label}":`)).child(input()))
        .when(!prompt && !!scr && this.canType(r), (e) => e.child(div().text_size(11).text_color(P.dim).child("No choices on its screen: what you type is pasted with Enter into its prompt.")).child(input()))
        .child(h_flex().gap(6).pt(2)
          .child(this.btn("pin-esc", "Cancel it (Esc)", P, (cx) => this.cancelPrompt(r, cx))));
    }
    const verb = sent?.verb ?? "Sent";
    const note = !sent ? null
      : sent.state === "sending" ? [P.dim, verb === "Sent" ? "Sending… Herdr waits if you have a half-typed draft in its terminal." : "Checking its prompt, then pressing…"]
      : sent.state === "sent" ? [P.post, `${verb}: "${sent.text.length > 48 ? sent.text.slice(0, 47) + "…" : sent.text}"`]
      : [P.fault, `Not done: ${sent.note}`];
    const open = this.isOpen(r.address);
    // The collapsed card says what opening it gives: a message box, or the prompt's choices.
    const what = blocked ? (prompt ? `Answer · ${prompt.options.length} choices` : "Answer") : "Message agent";
    const toggle = h_flex().id("pin-toggle").flex_none().mt(6).gap(6).items_center().cursor_pointer().text_size(11.5)
      .text_color(blocked ? P.bios : P.muted).hover((e) => e.text_color(P.text))
      .on_mouse_down("left", this.press).on_click((_e, cx) => {
        this.toggleOpen(r.address);
        if (!open && this.canType(r)) cx.timer.after(30, () => this.msg.focus());
        cx.notify();
      })
      .child(div().flex_none().w(10).child(open ? "▾" : "▸")).child(div().font_weight(600).child(what))
      .child(div().flex_1().h(1).bg(P.cardLine));
    const kept = this.pin === r.address;
    return card.id(`pin-${r.address}`)
      .on_hover((h, cx) => { this.cardHover = h; cx.notify(); })
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_mouse_down_out((_e, cx) => { if (!this.cardDrag) { this.closeCard(); cx.notify(); } })
      .child(toggle)
      // The bottom of its screen: the box is as tall as the card leaves it, and drops the top lines.
      .when(open, (e) => e
        .child(v_flex().mt(6).flex_1().min_h(48).p(6).justify_end().overflow_hidden().rounded(4).bg(P.bg).border_1().border_color(P.line).text_size(10.5).line_height("14px").text_color(P.muted)
          .children(lines.map((l) => div().flex_none().whitespace_nowrap().overflow_hidden().child(l || " "))))
        .child(div().flex_none().mt(6).child(lower))
        .when(!!note, (x) => x.child(div().flex_none().truncate().text_size(11).text_color(note[0]).child(note[1]))))
      .child(h_flex().flex_none().mt(6).gap(6).items_center()
        .child(this.btn("pin-go", "Go to it", P, () => this.focusAgent(r)))
        .child(div().flex_1().flex().justify_end().text_size(10.5).text_color(P.dim)
          .child([open && blocked && prompt && !ans ? "1–9 pick" : open && this.canType(r) ? "⏎ send" : null, kept ? "esc close" : "click the agent to keep this open"].filter(Boolean).join(" · "))))
      .when(open, (e) => e.child(div().id("card-size").absolute().right(0).bottom(0).w(16).h(16).cursor_nwse_resize().flex().items_end().justify_end().pr(2)
        .text_size(10).line_height("10px").text_color(P.dim).child("◢")
        .on_mouse_down("left", (ev, cx) => this.startCardDrag("size", ev, cx))));
  }

  row(r, P) {
    const st = { working: P.working, blocked: P.bios, done: P.post, error: P.fault }[r.status] ?? P.dim;
    // Selected: the agent whose card is open (clicked, or its chip hovered): a tint and a bar on the left.
    const sel = this.cardFor === r.address;
    // The badge reads like the agent's chip (names: space or address); the line beside it gives the other.
    const name = this.chipName(r), bySpace = name !== r.label.slice(0, 4);
    return h_flex().id(`row-${r.address}`).relative().gap(8).px(10).py(6).items_start().cursor_pointer()
      .when(sel, (e) => e.bg(alpha(P.lit, "1c")).child(div().absolute().left(0).top(0).bottom(0).w(3).bg(P.lit)))
      .hover((e) => e.bg(alpha(P.lit, sel ? "2c" : "14")))
      .on_hover((h, cx) => { this.selAddr = h ? r.address : this.selAddr === r.address ? null : this.selAddr; cx.notify(); })
      .on_mouse_down("left", this.press)
      .on_click((e, cx) => { if (e.click_count >= 2) this.focusAgent(r); else this.pinAgent(r, cx); cx.notify(); })
      .child(div().w(bySpace ? 64 : 40).flex_none().flex().justify_center().rounded(3).bg(chipColors(r, P).bg).text_color(P.agentFg).font_weight(700).whitespace_nowrap().overflow_hidden().child(name))
      .child(v_flex().flex_1().min_w(0).text_size(11.5)
        .child(h_flex().justify_between().gap(6)
          .child(h_flex().gap(5).items_center().min_w(0).when(!!r.space, (e) => e.child(this.avatar(r, 13))).child(div().truncate().child(`${bySpace ? r.label : r.space ?? ""}${r.remote ? " · " + r.machine : ""}`)))
          .child(div().flex_none().text_color(st).child(r.status ?? "no status")))
        .child(div().truncate().text_color(P.muted).child(r.title || "—"))
        .child(div().truncate().text_color(P.lit).child("▸ " + activity(r))));
  }

  /** The pane this copy is in, or null for a window. Two boards in one tab: the focused one. */
  myPane() {
    if (props()?.overlay) return null;
    if (props()?.pane) return props().pane;
    const tab = focused()?.tab;
    const here = panes().filter((p) => p.mod === MOD && p.tab === tab);
    return (here.length === 1 ? here[0] : here.find((p) => p.focused))?.pane ?? null;
  }

  /** This copy's pane, if it's in one: { pane, zoomed }. */
  paneInfo() {
    const id = this.myPane();
    return id ? panes().find((p) => p.pane === id) ?? null : null;
  }

  /** Is this copy the full-size window? */
  isFull() { return !!props()?.overlay && !!props()?.full; }

  /**
   * Full ↔ back. A replaced window keeps its spot (Herdr ignores a new `at`), and a copy that
   * closes its own window can't open another afterwards, so the new window opens first: Full is
   * a second, keyless window at the top left sized to Herdr's window; going back opens the
   * keyed window where it was (it sizes itself from settings), then the full one closes.
   */
  async toggleFull() {
    const overlay = props()?.overlay;
    if (!overlay) return;
    if (!this.isFull()) {
      openOverlay({ mod: MOD, kind: "window", width: 1, height: 1, at: { x: 0, y: 0 }, frame: "none", props: { full: true } });
      closeOverlay(overlay);
      return;
    }
    let at = null;
    try {
      const [x, y] = JSON.parse(await readTextFile(`${appHome()}/windows.json`))?.places?.[MOD] ?? [];
      if (Number.isFinite(x) && Number.isFinite(y)) at = { x, y };
    } catch (_e) { /* no spot yet: centered */ }
    openOverlay({ ...WINDOW, ...(at ? { at } : {}) });
    closeOverlay(overlay);
  }

  /** Starts dragging an edge of the window: "e" (right), "s" (bottom) or "se" (the corner). */
  startResize(edge, e, cx) {
    cx.stop_propagation();
    this.focus.focus();
    const S = settings();
    this.resizing = { edge, x0: e.position.x, y0: e.position.y, w0: S.winW, h0: S.winH, w: S.winW, h: S.winH };
    cx.notify();
  }

  /** ⤢: a pane fills its tab (Herdr's zoom) or goes back; a window goes full or back. */
  grow() {
    const p = this.paneInfo();
    if (p) run("pane.zoom", { pane: p.pane });
    else if (props()?.overlay) this.toggleFull();
  }

  /** Closes this board: its window, or its pane. */
  close() {
    const overlay = props()?.overlay;
    if (overlay) { closeOverlay(overlay); return; }
    const pane = this.myPane();
    if (pane) run("pane.close", { pane });
  }

  /** Opens or closes a menu. A press outside an open menu closes it first; if that press was on
   *  this menu's own button, the click that follows must not open it again. */
  toggleMenu(name) {
    if (this.menu === name) this.menu = null;
    else if (!(this.closed?.name === name && Date.now() - this.closed.at < 500)) this.menu = name;
    this.closed = null;
  }

  /** A menu box: closes on any press outside it, here or anywhere else in Herdr. */
  menuBox(id, P) {
    return v_flex().id(id).bg(P.card).border_1().border_color(P.cardLine).rounded(6).shadow_lg().text_size(12)
      .on_mouse_down("left", this.press)
      .on_mouse_down_out((_e, cx) => { if (this.menu) { this.closed = { name: this.menu, at: Date.now() }; this.menu = null; cx.notify(); } });
  }

  /** A bordered button. `chars`: a fixed width for labels up to that long. `caret`: a dropdown,
   *  drawn like a select box (label left, ▾ at the right edge). */
  btn(id, label, P, onClick, on = false, chars = 0, caret = false) {
    return div().id(id).px(6).py(2).rounded(4).border_1().when(chars > 0, (e) => e.w(BTN_W(chars)).flex_none().flex().items_center().overflow_hidden().whitespace_nowrap().when(caret, (x) => x.justify_between()).when(!caret, (x) => x.justify_center())).border_color(on ? P.lit : P.line).text_size(11.5).text_color(on ? P.text : P.muted)
      .cursor_pointer().hover((s) => s.text_color(P.text).border_color(P.dim))
      .on_mouse_down("left", this.press).on_click((_e, cx) => { onClick(cx); cx.notify(); })
      .child(label).when(caret, (e) => e.child(div().pl(4).text_color(P.dim).child("▾")));
  }

  cycle(key) { const l = key === "theme" ? themeOrder(this.themeDefs) : CYCLE[key], S = settings(); save({ [key]: l[(l.indexOf(S[key]) + 1) % l.length] }); }

  /* ---------------- themes ---------------- */

  /** Reads every themes/*.json. A file that fails keeps the board running and is listed in the theme menu. */
  async loadThemes() {
    const defs = BUILTIN(), errors = [];
    let names = [];
    try { names = (await fs.readdir(THEME_DIR())).filter((n) => n.endsWith(".json")); } catch (e) { errors.push(`themes folder: ${e.message ?? e}`); }
    for (const n of names) {
      const id = n.slice(0, -5);
      try { defs.set(id, parseTheme(id, await fs.readFile(`${THEME_DIR()}/${n}`, "utf8"))); } catch (e) { errors.push(`${n}: ${e.message ?? e}`); }
    }
    this.themeDefs = defs;
    this.themeErrors = errors;
    this.themeRev++;
  }

  /** Writes the current theme out as a new file with every role filled in, switches to it and opens it. */
  async copyTheme(P) {
    const base = settings().theme;
    let id = `${base}-copy`;
    for (let i = 2; this.themeDefs.has(id); i++) id = `${base}-copy-${i}`;
    const file = `${THEME_DIR()}/${id}.json`;
    try {
      await writeTextFile(file, themeFile(`${this.themeDefs.get(base)?.name ?? base} copy`, P), null);
      await this.loadThemes();
      save({ theme: id });
      const [cmd, args] = openCommand(PLATFORM, file, { text: true });
      exec(cmd, args).catch(() => {});
    } catch (e) { this.themeErrors = [...this.themeErrors, `copy: ${e.message ?? e}`]; }
  }

  /* ---------------- drawing: all machines ---------------- */

  overview(P, S, width) {
    const list = this.machineList();
    const cols = width >= 1000 ? Math.min(list.length, 2) : 1;
    const tileW = Math.floor((width - 32 - (cols - 1) * 16) / cols);
    return div().id("overview").size_full().overflow_y_scrollbar()
      .child(h_flex().flex_wrap().gap(16).p(16).items_start().children(list.map((m) => this.machineTile(m, P, S, tileW))));
  }

  machineTile(m, P, S, w) {
    const recs = [...this.recs.values()].filter((r) => machineKey(r) === m.key && this.spaceOk(r, S));
    const top = recs.filter((r) => !r.parent);
    const count = (s) => top.filter((r) => r.status === s).length;
    const cellOf = (r) => (ALERT.has(r.comp) && r.comp !== "fault" ? "alert" : r.comp);
    const cellW = Math.floor((w - 24 - 4 - 16) / 3) - 1;
    const open = () => save({ machine: m.key });
    const mini = (r) => {
      const led = { working: P.working, blocked: P.bios, done: P.post, error: P.fault }[r.status] ?? P.dim;
      let dot = div().absolute().top(-2).right(-2).w(6).h(6).rounded(3).bg(led);
      if (r.status === "working") dot = dot.loop("opacity", { from: 0.3, to: 1, period: 1100 });
      if (r.status === "blocked") dot = dot.loop("opacity", { from: 0.1, to: 1, period: 500 });
      return div().id(`mini-${r.address}`).relative().pl(7).pr(5).rounded(3).bg(chipColors(r, P).bg)
        .child(div().absolute().left(0).top(0).bottom(0).w(3).rounded_l(3).bg(this.spaceTint(r))).text_color(P.agentFg).text_size(11).font_weight(r.parent ? 600 : 700)
        .opacity(r.status === "idle" || !r.status ? 0.55 : 1)
        .when(r.status === "blocked", (e) => e.border_1().border_color(P.bios))
        .cursor_pointer().tooltip(`${r.label} · ${r.space ?? "no space"} · ${r.title || r.program?.name || "agent"}\n${activity(r)}`)
        .on_mouse_down("left", this.press).on_click((e, cx) => { if (e.click_count >= 2) this.focusAgent(r); else this.pinAgent(r, cx); cx.notify(); })
        .child(this.chipName(r, S)).child(dot);
    };
    const statusPart = (s, label, color) => h_flex().gap(5).items_center().opacity(count(s) ? 1 : 0.45)
      .child(div().w(7).h(7).rounded(4).bg(color)).child(div().text_color(P.muted).child(`${count(s)} ${label}`));
    return v_flex().id(`tile-${m.key}`).w(w).p(12).gap(10).rounded(6).border_2().border_color(P.frame).bg(P.bg).cursor_pointer()
      .hover((s) => s.border_color(P.lit))
      .on_mouse_down("left", this.press).on_click((_e, cx) => { open(); cx.notify(); })
      .child(h_flex().gap(8).items_center()
        .child(div().w(9).h(9).rounded(5).bg(m.online ? P.led : P.fault).when(m.online, (e) => e.loop("opacity", { from: 0.4, to: 1, period: 2600 })))
        .child(div().text_size(15).font_weight(700).child(m.name))
        .child(div().text_size(12).text_color(P.dim).child(m.online ? m.note : "unreachable"))
        .child(div().flex_1())
        .child(div().text_size(12).text_color(P.lit).child("open board ›")))
      .child(h_flex().gap(14).flex_wrap().text_size(12)
        .child(statusPart("working", "working", P.working)).child(statusPart("blocked", "need you", P.bios))
        .child(statusPart("done", "done", P.post)).child(statusPart("idle", "idle", P.dim))
        .when(count("error") > 0, (e) => e.child(statusPart("error", "error", P.fault))))
      .when(top.length === 0, (e) => e.child(div().py(10).text_size(12).text_color(P.dim).child(m.online ? "No agents running on this machine." : "Herdr can't reach this machine right now.")))
      .when(top.length > 0, (e) => e.child(h_flex().flex_wrap().gap(8).children(CELLS.map(([key, label, role]) => {
        const here = recs.filter((r) => cellOf(r) === key).sort((a, b) => a.arr - b.arr);
        return v_flex().w(cellW).min_h(58).p(6).gap(5).rounded(3).border_1().border_color(P[role]).bg(here.length ? alpha(P[role], "0c") : P.bg).opacity(here.length ? 1 : 0.4)
          .child(h_flex().justify_between().text_size(11).child(div().font_weight(700).text_color(P[role]).child(label)).child(div().text_color(P.dim).child(String(here.length))))
          .child(h_flex().flex_wrap().gap(5).items_center().children(here.slice(0, 3).map(mini))
            .when(here.length > 3, (x) => x.child(div().text_size(11).text_color(P.muted).child(`+${here.length - 3} more`))));
      }))));
  }

  /* ---------------- render ---------------- */

  render(cx) {
    const S = settings();
    const t = theme();
    const P = palette(S.theme, this.themeDefs, t, herdrThemes);
    this.t = t;
    this.spaceColors = shared("space.colors") ?? {};
    this.ensureBoard(S);
    const overlay = props()?.overlay;
    const overviewOn = S.machine === "all";
    const mlist = this.machineList();
    const here = mlist.find((m) => m.key === S.machine);
    const width = this.size?.width ?? 900, height = this.size?.height ?? 560;
    const railW = !overviewOn && S.labels === "full" && width >= 760 ? 290 : 0;
    // Only until the body has been measured: header, options, machines row and log bar.
    const chromeH = 40 + 40 + 40 + (S.ticker ? 26 : 0);
    const view = overviewOn ? "overview" : S.view;
    const iso = view === "iso" ? this.iso : null;
    const GW = iso ? iso.w : W, GH = iso ? iso.h : H;
    const availH = (this.bodySize?.height ?? height - chromeH) - 16;
    const fs = Math.max(6, Math.min(16, (width - railW - 20) / (GW * ADV), availH / (GH * LH)));
    const cw = fs * ADV, ch = fs * LH;
    const stageW = GW * cw, stageH = GH * ch;
    const proj = iso ? (pt) => iso.at(pt.x, pt.y) : (pt) => pt;
    const bodyH = this.bodySize?.height ?? height - chromeH;
    const ox = Math.max(8, (width - railW - stageW) / 2), oy = Math.max(8, (bodyH - stageH) / 2);
    const pl = this.places(S);
    const recs = [...this.recs.values()];
    const shown = this.cardTarget(S);
    let cardR = shown && shown === this.cardFor ? this.recs.get(shown) : null;
    const vis = recs.filter((r) => !r.parent && this.visible(r, S));
    const working = vis.filter((r) => r.status === "working").length;
    const blocked = vis.filter((r) => r.status === "blocked").length;
    const fanMs = working ? Math.max(70, 260 - working * 35) : 600;

    /* header */
    const spaceLabel = !S.spaces ? "all" : S.spaces === "current" ? "current" : S.spaces.length ? `${S.spaces.length} of ${this.spaceList().length}` : "none";
    const menus = this.menus(P, S, recs, bodyH);
    /** A button whose menu opens pinned to it: Popup paints it above everything, inside the window. */
    const dd = (id, name, label, chars, anchor = "top_left") => {
      const trigger = this.btn(id, label, P, () => this.toggleMenu(name), this.menu === name, chars, chars > 1);
      const m = this.menu === name ? menus[name]?.() : null;
      return Popup.new(`pop-${id}`, trigger).anchor(anchor).when(!!m, (e) => e.content(div().pt(4).child(m)));
    };
    const pane = this.paneInfo();
    const themeName = (this.themeDefs.get(S.theme)?.name ?? S.theme).slice(0, 12);
    const longestTheme = Math.max(5, ...[...this.themeDefs.values()].map((d) => Math.min(12, d.name.length)));
    const title = h_flex().flex_1().min_w(0).gap(10).items_center().overflow_hidden().whitespace_nowrap()
      .child(div().flex_none().w(8).h(8).rounded(4).bg(P.led).loop("opacity", { from: 0.35, to: 1, period: 2600 }))
      .child(div().flex_none().font_weight(700).child("MOTHERBOARD"))
      .when(this.demoOn, (e) => e.child(div().flex_none().px(6).rounded(3).bg(P.tpm).text_color(inkOn(P.tpm)).text_size(11).font_weight(700).child("DEMO")))
      .child(div().min_w(0).truncate().text_color(P.muted).child(`${vis.length} agents · ${working} working${blocked ? ` · ${blocked} need${blocked === 1 ? "s" : ""} you` : ""}`));
    // Window controls, docked top right: help, size, close.
    const controls = h_flex().flex_none().gap(4)
      .child(dd("b-legend", "legend", "?", 1, "top_right"))
      .child(this.btn("b-grow", pane?.zoomed || this.isFull() ? "⤡" : "⤢", P, () => this.grow(), !!pane?.zoomed || this.isFull(), 1))
      .child(this.btn("b-close", "✕", P, () => this.close(), false, 1));
    // Options: fixed widths, always all there, in three groups. Narrow boards wrap the groups
    // onto more lines; that depends on width alone, so changing an option moves nothing.
    const group = (...els) => h_flex().flex_none().gap(5).children(els);
    const options = h_flex().px(10).py(6).gap_x(12).gap_y(6).flex_wrap().items_center().border_t(1).border_color(P.line)
      .child(group(
        dd("b-view", "view", `view: ${S.view}`, 13),
        dd("b-spaces", "spaces", `spaces: ${spaceLabel}`, 17),
        dd("b-theme", "themes", `theme: ${themeName}`, 9 + longestTheme)))
      .child(group(
        this.btn("b-names", `names: ${S.names}`, P, () => this.cycle("names"), false, 14),
        dd("b-labels", "labels", `labels: ${S.labels}`, 15),
        dd("b-motion", "motion", `motion: ${S.motion}`, 17)))
      .child(group(
        this.btn("b-log", "log", P, () => save({ ticker: !S.ticker }), S.ticker, 3),
        this.btn("b-demo", this.demoOn ? "demo: on" : "demo", P, () => save({ demo: !S.demo }), this.demoOn, 8)));
    const head = v_flex().flex_none().bg(P.head).border_b(1).border_color(P.line).text_size(12)
      .child(h_flex().px(10).py(6).gap(12).items_center().child(title).child(controls))
      .child(options);

    /* machines: All machines › one machine */
    const mcount = (key) => recs.filter((r) => !r.parent && this.spaceOk(r, S) && (key === "all" || machineKey(r) === key)).length;
    const machineBtn = (id, dot, name, n, on, fn) => h_flex().id(id).flex_none().h(26).px(10).gap(8).items_center().rounded(4).border_1()
      .border_color(on ? P.lit : P.line).when(on, (e) => e.bg(alpha(P.lit, "14"))).text_color(on ? P.text : P.muted)
      .cursor_pointer().hover((e) => e.text_color(P.text).border_color(on ? P.lit : P.dim))
      .on_mouse_down("left", this.press).on_click((_e, cx) => { fn(); cx.notify(); })
      .when(!!dot, (e) => e.child(div().text_size(9).text_color(dot === "●" ? P.led : P.fault).child(dot)))
      .child(div().font_weight(on ? 700 : 400).child(name))
      .child(div().px(6).rounded(8).bg(alpha(P.dim, "33")).text_size(10.5).text_color(P.muted).child(String(n)));
    const machinesRow = h_flex().flex_none().px(10).py(7).gap_x(8).gap_y(6).items_center().flex_wrap().border_b(1).border_color(P.line).text_size(11.5)
      .child(machineBtn("m-all", null, "All machines", mcount("all"), overviewOn, () => save({ machine: "all" })))
      .child(div().text_color(P.dim).child("›"))
      .children(mlist.map((m) => machineBtn(`m-${m.key}`, m.online ? "●" : "○", m.name, mcount(m.key), S.machine === m.key, () => save({ machine: m.key }))))
      .when(!overviewOn && !!here, (e) => e.child(div().pl(4).text_color(P.dim).child(here.online ? (here.key === "local" ? "this computer" : "live over ssh") : "unreachable")));

    /* body */
    const body = div().id("body").relative().flex_1().min_h(0).min_w(0).h_full().overflow_hidden()
      .on_size_change((s, cx) => { this.bodySize = s; this.instant = true; cx.notify(); });
    const pop = [];

    if (overviewOn) {
      body.child(this.overview(P, S, width));
    } else if (view === "scope") {
      body.child(this.scopeView(P, S, width - railW));
    } else {
      const stage = div().id("stage").absolute().left(ox).top(oy).w(stageW).h(stageH);
      const glows = [];
      if (!iso) for (const [k, c] of Object.entries(this.board.comps)) {
        const occ = recs.some((r) => r.comp === k && !r.moving && this.visible(r, S));
        if (!occ) continue;
        glows.push(div().absolute().left((c.x + 0.5) * cw).top((c.y + 0.5) * ch).w((c.w - 1) * cw).h((c.h - 1) * ch).rounded(2)
          .border_1().border_color(P[c.role]).bg(alpha(P[c.role], "10"))
          .loop("opacity", { from: 0.25, to: 0.85, period: ALERT.has(k) ? 900 : 2800 }));
      }
      const chips = [];
      for (const r of recs) {
        if (!this.visible(r, S)) continue;
        const at = pl.at.get(r.address);
        if (!r.moving && (!at || at.hidden)) continue;
        chips.push(this.chipEl(r, at, P, S, fs, cw, ch, proj));
      }
      const pills = pl.pills.map((p) => {
        const c = this.board.comps[p.comp];
        const wcells = p.pillSlots === 2 ? this.sp + this.chipCells(S) : this.chipCells(S);
        const q = proj(p.pillAt);
        return div().id(`pill-${p.comp}`).absolute().left((q.x + 0.5 - this.chipCells(S) / 2) * cw).top(q.y * ch).w(wcells * cw).h(ch)
          .flex().items_center().justify_center().rounded(3).bg(P.head).border_1().border_color(this.pill.pinned === p.comp ? P.lit : P[c.role])
          .text_size(fs * 0.9).font_weight(700).text_color(P.text).cursor_pointer()
          .on_hover((h, cx) => { if (h) { this.pill.hover = p.comp; this.pill.leftAt = 0; } else if (this.pill.hover === p.comp) { this.pill.hover = null; this.pill.leftAt = Date.now(); this.pill.last = p.comp; } cx.notify(); })
          .on_mouse_down("left", this.press)
          .on_click((_e, cx) => { this.pill.pinned = this.pill.pinned === p.comp ? null : p.comp; cx.notify(); })
          .child(p.pillSlots === 2 ? `+${p.more} more` : `+${p.more}`);
      });
      if (iso) stage.children(this.isoEls(P, fs, cw, ch, recs, S, fanMs)).children(this.isoTrailEls(P, fs, cw, ch, S));
      else stage.child(div().absolute().left(0).top(0).w(stageW).h(stageH).children(glows))
        .children(this.paths(P, cw, ch))
        .children(this.textEls(P, fs, cw, ch, fanMs))
        .children(this.trailEls(P, cw, ch, S));
      stage.children(chips)
        .children(pills);
      if (P.scan) {
        const lines = [];
        for (let y = 2; y < stageH; y += 3) lines.push(div().absolute().left(0).top(y).w(stageW).h(1).bg("#00000052"));
        stage.child(div().absolute().left(0).top(0).w(stageW).h(stageH).children(lines));
      }
      body.child(stage);

      const crowdComp = this.pill.pinned ?? this.pill.hover ?? (this.pill.leftAt || this.pill.inside ? this.pill.last : null);
      const crowdInfo = crowdComp ? pl.pills.find((p) => p.comp === crowdComp) : null;
      // A crowd list under the pointer wins over a hover card; a pinned card wins over both.
      if (crowdInfo && !this.pin) cardR = null;
      if (cardR) {
        // Placed beside its chip once, then left there: a card that followed the chip would jump while you type.
        if (!this.pinAt) {
          const PIN_W = settings().cardW;
          // A moving chip (they shift even within a component): where it's headed, not a fixed spot.
          const pt = proj(this.chipPt(cardR, pl.at.get(cardR.address)) ?? { x: 50, y: 10 });
          // 10 px clear of the chip's own edges, right of it if it fits, so the card never hides it.
          const half = this.chipCells(S) / 2;
          const right = ox + (pt.x + 0.5 + half) * cw + 10, left = ox + (pt.x + 0.5 - half) * cw - PIN_W - 10;
          this.pinAt = { x: right + PIN_W + 4 > width - railW ? left : right, y: oy + pt.y * ch - 12 };
        }
      } else if (crowdInfo) {
        const pq = proj(crowdInfo.pillAt);
        const px = ox + (pq.x + 6) * cw, py = oy + pq.y * ch;
        const left = px + 340 > width - railW ? Math.max(4, px - 360) : px;
        const crowdH = Math.min(320, bodyH - 8, 30 + crowdInfo.list.length * 66);
        pop.push(floating(left, Math.max(4, Math.min(py - 20, bodyH - crowdH - 4)), 340, crowdH, v_flex().id("crowd")
          .bg(P.card).border_1().border_color(P.cardLine).rounded(6).shadow_lg().py(4)
          .on_hover((h, cx) => { this.pill.inside = h; if (!h) this.pill.leftAt = Date.now(); cx.notify(); })
          .on_mouse_down("left", this.press)
          .child(div().px(10).py(4).text_size(10.5).text_color(P.dim).child(`${LABEL[crowdComp]} · ${crowdInfo.list.length} agents · ${crowdInfo.more} not on the board`))
          .children(crowdInfo.list.map((r) => this.row(r, P)))));
      }
    }

    if (cardR) {
      // Beside its chip in the board and iso views (or where you dragged it), top right in the
      // scope and the overview. Kept inside the body.
      const { w: pw, h: ph0 } = this.cardSize();
      const ph = this.isOpen(cardR.address) ? ph0 : 220;
      const want = this.pinAt ?? { x: width - railW - pw - 12, y: 8 };
      const at = { x: Math.max(4, Math.min(want.x, width - railW - pw - 4)), y: Math.max(4, Math.min(want.y, bodyH - ph - 4)) };
      if (!this.cardDrag) this.pinAt = at;
      this.cardShown = at;
      pop.push(div().absolute().left(at.x).top(at.y).child(this.card(cardR, P, true)));
    }

    if (Array.isArray(S.spaces) && S.spaces.length === 0 && !this.menu)
      body.child(div().absolute().top(10).left(0).right(0).flex().justify_center().child(h_flex().gap(8).px(10).py(4).rounded(4).bg(P.card).border_1().border_color(P.cardLine).text_size(12)
        .child(div().text_color(P.muted).child("No spaces selected, so no agents are shown."))
        .child(this.btn("f-all2", "Show all", P, () => save({ spaces: null })))));
    body.children(pop);

    const rail = railW ? v_flex().id("rail").w(railW).flex_none().h_full().border_l(1).border_color(P.line).overflow_y_scrollbar()
      .children(recs.filter((r) => this.visible(r, S)).map((r) => this.row(r, P))) : null;

    const moves = this.log.filter((l) => overviewOn || (l.machine ?? "local") === S.machine);
    const ticker = S.ticker ? h_flex().px(12).h(26).flex_none().items_center().gap(22).overflow_hidden().whitespace_nowrap().bg(P.head).border_t(1).border_color(P.line).text_size(11.5).text_color(P.muted)
      .when(!!this.flash, (e) => e.child(div().text_color(P.tpm).child(this.flash)))
      .when(moves.length === 0 && !this.flash, (e) => e.child(div().text_color(P.dim).child("No moves yet. Chips travel when an agent changes what it is doing.")))
      .children(moves.slice(0, 5).map((l, i) => h_flex().flex_none().gap(6)
        .child(div().text_color(P.dim).child(clock(l.t)))
        .child(div().text_color(i === 0 ? P.text : P.muted).child(`${overviewOn && l.machine ? l.machine + "/" : ""}${l.label} → ${LABEL[l.comp] ?? l.comp}  ${l.detail}`)))) : null;
    this.flash = null;

    const win = !!overlay && !this.isFull();
    const rz = this.resizing;
    const boardW = win ? (rz ? rz.w : S.winW) : null, boardH = win ? (rz ? rz.h : S.winH) : null;
    const board = v_flex().id("mb-root").when(win, (e) => e.w(boardW).h(boardH).rounded(8).border_1().border_color(P.frame))
      .when(!win, (e) => e.size_full()).when(!!overlay && !win, (e) => e.border_1().border_color(P.frame))
      .bg(P.bg).text_color(P.text).font_family(MONO).overflow_hidden()
      .track_focus(this.focus)
      .on_mouse_down("left", (_e, cx) => { this.endCardDrag(); this.focus.focus(); if (this.menu) { this.menu = null; cx.notify(); } })
      .on_key_down((e, cx) => this.key(e, cx))
      // Dragging the card: the root hears the pointer anywhere on the board. No layer over the
      // board, so a lost release can't swallow the next click; that click just ends the drag.
      .when(!!this.cardDrag, (e) => e.when(this.cardDrag.mode === "move", (x) => x.cursor_grabbing()).when(this.cardDrag.mode === "size", (x) => x.cursor_nwse_resize())
        .on_mouse_move((m, cx) => {
          const d = this.cardDrag;
          if (!d) return;
          const dx = m.position.x - d.x0, dy = m.position.y - d.y0;
          if (d.mode === "move") this.pinAt = { x: Math.round(d.at.x + dx), y: Math.round(d.at.y + dy) };
          else { d.w = Math.max(CARD_MIN_W, Math.round(settings().cardW + dx)); d.h = Math.max(CARD_MIN_H, Math.round(settings().cardH + dy)); }
          cx.notify();
        })
        .on_mouse_up("left", (_m, cx) => {
          const d = this.cardDrag;
          this.cardDrag = null;
          if (d?.mode === "size") save({ cardW: d.w, cardH: d.h });
          cx.notify();
        }))
      .on_size_change((s, cx) => { this.size = s; this.instant = true; cx.notify(); })
      .child(head)
      .child(machinesRow)
      .child(h_flex().id("mid").flex_1().min_h(0).w_full().items_start().child(body).when(!!rail, (e) => e.child(rail)))
      .when(!!ticker, (e) => e.child(ticker));
    if (!win) return board;
    // Drag the right edge, the bottom edge or the corner. Herdr can't move a window's top left
    // from a mod, so those edges don't resize.
    const handle = (edge, el) => el.absolute().on_mouse_down("left", (e, cx) => this.startResize(edge, e, cx));
    return div().id("mb-window").relative().w(boardW + (rz ? CATCH : 0)).h(boardH + (rz ? CATCH : 0))
      .when(!!rz, (e) => e
        .on_mouse_move((m, cx) => {
          const r = this.resizing;
          if (!r) return;
          if (r.edge !== "s") r.w = Math.max(MIN_W, Math.round(r.w0 + m.position.x - r.x0));
          if (r.edge !== "e") r.h = Math.max(MIN_H, Math.round(r.h0 + m.position.y - r.y0));
          cx.notify();
        })
        .on_mouse_up("left", (_m, cx) => { const r = this.resizing; this.resizing = null; if (r) save({ winW: r.w, winH: r.h }); cx.notify(); }))
      .child(board)
      .child(handle("e", div().left(boardW - 5).top(8).w(10).h(boardH - 16).cursor_ew_resize()))
      .child(handle("s", div().left(8).top(boardH - 5).w(boardW - 16).h(10).cursor_ns_resize()))
      .child(handle("se", div().left(boardW - 14).top(boardH - 14).w(18).h(18).cursor_nwse_resize()));
  }

  key(e, cx) {
    const k = e.key, ch = e.key_char;
    const m = e.modifiers ?? {};
    if (m.control || m.platform || m.alt) return;
    // Typing a message: every key is the box's, except Esc, which closes the card.
    if (this.typing) {
      if (k === "escape") { this.closeCard(true); cx.stop_propagation(); cx.notify(); }
      return;
    }
    const S = settings();
    const list = [...this.recs.values()].filter((r) => this.visible(r, S));
    const step = (dir) => {
      if (!list.length || S.machine === "all") return;
      this.sel = (this.sel + dir + list.length) % list.length;
      this.hover = list[this.sel].address;
    };
    const act = {
      c: () => this.cycle("theme"), t: () => save({ ticker: !S.ticker }),
      d: () => save({ demo: !S.demo }), n: () => this.cycle("names"), v: () => this.toggleMenu("view"), l: () => this.toggleMenu("labels"), m: () => this.toggleMenu("motion"), a: () => save({ machine: "all" }), backspace: () => save({ machine: "all" }),
      f: () => this.toggleMenu("spaces"),
      s: () => save({ spaces: S.spaces === "current" ? null : "current" }),
      right: () => step(1), left: () => step(-1),
      enter: () => { const r = this.recs.get(this.pin ?? this.hover); if (r) this.focusAgent(r); },
      r: () => { const r = this.recs.get(this.hover ?? this.pin); if (r) { if (!this.isOpen(r.address)) this.toggleOpen(r.address); this.pinAgent(r, cx); } },
      // The top view first: a menu, then the card, then the window.
      escape: () => {
        if (this.menu || this.pill.pinned) { this.menu = null; this.pill.pinned = null; }
        else if (this.cardFor) this.closeCard(true);
        else if (props()?.overlay) this.close();
      },
      z: () => this.grow(),
    };
    const pinR = this.cardFor ? this.recs.get(this.cardFor) : null;
    const opt = pinR && this.isOpen(pinR.address) && /^[1-9]$/.test(k) ? this.promptOf(pinR)?.options.find((o) => o.n === +k) : null;
    const fn = ch === "?" ? () => this.toggleMenu("legend") : opt ? () => this.answerOption(pinR, opt, cx) : act[k];
    if (!fn) return;
    fn();
    this.syncCard(cx);
    cx.stop_propagation();
    cx.notify();
  }
}

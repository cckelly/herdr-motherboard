// The board's geometry, in character cells. Pure: no herdr or gpui-kit imports, so
// `node --test` can load it. Lines are drawn as vectors from RECTS/LINES (never as
// box-drawing glyphs, which jag when a fallback font or line height is involved);
// only words and small parts are text.

export const W = 104;
export const H = 25;
export const BUS1 = 10;
export const BUS2 = 16;
export const LANES = [4, 90];
/** Line height and glyph advance, as multiples of the font size (JetBrains Mono). */
export const LH = 1.32;
export const ADV = 0.6;

const BASE = {
  nic: { x: 2, y: 2, w: 15, h: 7, band: "top", title: "I/O · NIC", role: "nic" },
  cpu0: { x: 28, y: 2, w: 40, h: 7, band: "top", title: "CPU", role: "cpu" },
  ram: { x: 77, y: 2, w: 25, h: 7, band: "top", title: "RAM · idle", role: "ram" },
  gpu: { x: 8, y: 12, w: 80, h: 4, band: "mid", title: "PCIe x16 · sub-agents", role: "gpu" },
  fault: { x: 92, y: 12, w: 10, h: 4, band: "mid", title: "FAULT", role: "fault" },
  nvme: { x: 2, y: 18, w: 20, h: 6, band: "bot", title: "M.2 NVMe", role: "nvme" },
  pch: { x: 24, y: 18, w: 16, h: 6, band: "bot", title: "PCH", role: "pch" },
  post: { x: 42, y: 18, w: 17, h: 6, band: "bot", title: "POST ✓", role: "post" },
  bios: { x: 61, y: 18, w: 15, h: 6, band: "bot", title: "BIOS ⚠", role: "bios" },
  panel: { x: 78, y: 18, w: 12, h: 6, band: "bot", title: "F_PANEL", role: "panel" },
  tpm: { x: 92, y: 18, w: 10, h: 6, band: "bot", title: "TPM", role: "tpm" },
};

/** What being in each component means, in a word or two (iso front faces, scope traces). */
export const MEANS = { cpu0: "thinking", nic: "network", ram: "idle", gpu: "sub-agents", fault: "error", nvme: "writing", pch: "running", post: "done", bios: "permission", panel: "question", tpm: "login" };

export const LABEL = { cpu0: "CPU", nic: "NIC", ram: "RAM", gpu: "PCIe", fault: "FAULT", nvme: "NVMe", pch: "PCH", post: "POST", bios: "BIOS", panel: "F_PANEL", tpm: "TPM" };
export const ALERT = new Set(["bios", "panel", "tpm", "fault"]);
export const CORES = [30, 38, 46, 54];

export const padX = (c) => (c.band === "top" ? c.x + Math.floor(c.w / 2) : c.x + 1);
export const busOf = (c) => (c.band === "bot" ? BUS2 : BUS1);
const irow = (c) => (c.band === "top" ? c.y + c.h - 2 : c.y + 1);

const fit = (s, n) => ([...s].length <= n ? s : [...s].slice(0, n - 1).join("") + "…");

/** Builds one machine's board. `machine`: its name, shown on the CPU; `online`: whether it's reachable. */
export function buildBoard({ machine = "this computer", online = true } = {}) {
  const comps = {};
  for (const [k, c] of Object.entries(BASE)) comps[k] = { ...c };
  comps.cpu0.title = fit(`CPU · ${machine}${online ? "" : " (unreachable)"}`, comps.cpu0.w - 4);

  const text = [];
  const t = (x, y, s, cls) => text.push({ x, y, s, cls });
  const gaps = {};
  t(3, 0, " HRD-X870 · AGENT BOARD ", "frame title");
  for (const [k, c] of Object.entries(comps)) {
    const s = " " + c.title + " ";
    t(c.x + 2, c.y, s, c.role + " title");
    gaps[k] = [c.x + 2, c.x + 1 + [...s].length];
  }
  for (let y = 3; y <= 5; y++) { t(19, y, "▮▮▮▮▮", "vrm"); t(70, y, "▮▮▮▮", "vrm2"); }
  t(19, 7, "◇", "xtal"); t(21, 7, "25MHz", "silk");
  t(3, 3, "▣ RJ-45", "nic"); t(3, 4, "⇅ 2.5GbE", "dim");
  CORES.forEach((x, i) => t(x + 2, 3, "c" + i, "dim"));
  t(63, 4, "◜", "fan");
  t(30, 6, "L3 " + "░".repeat(25), "dim");
  for (const y of [3, 5, 7]) t(78, y, "▕" + "▓".repeat(21) + "▏", "dim");
  const g = comps.gpu, fins = Math.floor((g.x + g.w - 2 - 22) / 2);
  t(10, 13, "slot 1 ·", "dim"); t(22, 13, "┃ ".repeat(fins).trimEnd(), "dim");
  t(94, 13, "error", "dim");
  t(4, 19, "writing", "dim"); t(12, 19, "▯▯▯▯▯▯▯▯", "nvme");
  t(26, 19, "running", "dim"); t(34, 19, "▓▓▓▓", "pch");
  t(44, 19, "done", "dim"); t(50, 19, "● ● ● ●", "led");
  t(63, 19, "permission", "dim"); t(80, 19, "question", "dim"); t(94, 19, "login", "dim");
  t(2, 1, "◦ MH1", "silk"); t(W - 7, 1, "MH2 ◦", "silk"); t(40, 1, "rev 1.0 · herdr", "silk"); t(72, 9, "VCORE", "silk");
  t(14, 17, "SATA_0", "silk"); t(84, 17, "USB3_F", "silk");

  const rects = [{ x0: 0, y0: 0, x1: W - 1, y1: H - 1, cls: "frame", gap: [3, 3 + 23], dbl: true }];
  for (const [k, c] of Object.entries(comps)) rects.push({ x0: c.x, y0: c.y, x1: c.x + c.w - 1, y1: c.y + c.h - 1, cls: c.role, gap: gaps[k] });
  rects.push({ x0: 18, y0: 2, x1: 24, y1: 6, cls: "deco" }, { x0: 69, y0: 2, x1: 74, y1: 6, cls: "deco" }, { x0: 61, y0: 3, x1: 65, y1: 5, cls: "deco" });
  for (const x of CORES) rects.push({ x0: x, y0: 3, x1: x + 6, y1: 5, cls: "deco", gap: [x + 2, x + 3] });

  const lines = [];
  for (const bus of [BUS1, BUS2]) {
    const xs = [...LANES, ...Object.values(comps).filter((c) => busOf(c) === bus).map(padX)];
    lines.push({ pts: [[Math.min(...xs), bus], [Math.max(...xs), bus]], cls: "bus", dbl: true });
  }
  for (const lx of LANES) lines.push({ pts: [[lx, BUS1], [lx, BUS2]], cls: "trace" });
  for (const c of Object.values(comps)) {
    const px = padX(c);
    lines.push({ pts: c.band === "top" ? [[px, c.y + c.h - 1], [px, BUS1]] : [[px, busOf(c)], [px, c.y]], cls: "trace" });
  }
  return { comps, text, rects, lines };
}

/** Docking spots per component. `sp`: columns between chips (wider when short labels show). */
export function buildSlots(comps, sp, cells = 4) {
  const out = {};
  for (const [k, c] of Object.entries(comps)) {
    const s = [];
    // A slot is a chip's center column (the chip spans x + 0.5 ± cells / 2). A component too
    // narrow for one gets a single slot in its middle.
    const row = (y, tw) => {
      const n = s.length;
      for (let x = c.x + Math.ceil(1 + cells / 2); x + 0.5 + cells / 2 <= c.x + c.w - 2; x += sp) s.push({ x, y, tw });
      if (s.length === n) s.push({ x: c.x + Math.round(c.w / 2 - 0.5), y, tw });
    };
    if (k === "cpu0") {
      for (const x of CORES) s.push({ x: x + 3, y: c.y + 2, tw: 7 });
      row(c.y + 5, sp - 1);
    } else {
      const rows = k === "nic" ? [c.y + 3, c.y + 5] : k === "ram" ? [c.y + 2, c.y + 4] : c.band === "mid" ? [c.y + 2] : [c.y + 2, c.y + 4];
      for (const y of rows) row(y, sp - 1);
    }
    out[k] = s;
  }
  return out;
}

function simplify(pts) {
  const out = [];
  for (const p of pts) {
    const l = out[out.length - 1];
    if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p);
  }
  for (let i = out.length - 2; i > 0; i--) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) out.splice(i, 1);
  }
  return out;
}

/** Corner points from a spot in one component to a spot in another, along the traces. */
export function route(comps, fromComp, from, toComp, to) {
  const A = comps[fromComp], B = comps[toComp];
  const pa = padX(A), pb = padX(B), ba = busOf(A), bb = busOf(B), ia = irow(A), ib = irow(B);
  const pts = [[from.x, from.y], [from.x, ia], [pa, ia], [pa, ba]];
  if (ba !== bb) {
    const cost = (l) => Math.abs(pa - l) + Math.abs(l - pb);
    const lane = LANES.reduce((best, l) => (cost(l) < cost(best) ? l : best), LANES[0]);
    pts.push([lane, ba], [lane, bb]);
  }
  pts.push([pb, bb], [pb, ib], [to.x, ib], [to.x, to.y]);
  return simplify(pts);
}

/**
 * Segment timings for a path. Speed is uniform on screen: a row is LH/ADV columns tall.
 * `motion`: "full" walks every corner; "reduced" goes straight; "off" jumps.
 */
export function plan(pts, motion, msPerCol = 11) {
  const last = pts[pts.length - 1];
  if (motion === "off" || pts.length < 2) return [{ from: pts[0], to: last, d: 0 }];
  if (motion === "reduced") return [{ from: pts[0], to: last, d: 450, straight: true }];
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    segs.push({ from: pts[i - 1], to: pts[i], d: Math.max(40, Math.round((Math.abs(x1 - x0) + Math.abs(y1 - y0) * (LH / ADV)) * msPerCol)) });
  }
  return segs;
}

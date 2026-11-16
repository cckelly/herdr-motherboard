// The isometric view: the same board, drawn in 3D with ASCII. An oblique projection where
// depth recedes up and to the right one column per row, so every edge lands on a character:
// "_" for edges across, "/" for edges into the screen, "|" for edges up.
// Pure: no herdr or gpui-kit imports. Colors are role names, "role/aa" for a role at alpha aa.

import { W, H, BUS1, BUS2, LANES, LABEL, MEANS, padX, busOf } from "./board.js";

/**
 * Board row → rows of depth. Uneven on purpose: each bus gets a row of its own between the
 * blocks in front of and behind it, which a uniform scale can't give blocks this tall.
 * [board y, depth rows], front to back; linear in between.
 */
const DEPTH = [[H, 0], [23, 1], [18, 4], [BUS2, 8], [15, 9], [12, 11], [BUS1, 15], [8, 16], [2, 19], [-1, 21]];
/** How tall each component stands, in rows: a name row, a meaning row and the bottom edge. */
const Z = { cpu0: 3, ram: 3, nic: 3, gpu: 3, fault: 3, nvme: 3, pch: 3, post: 3, bios: 3, panel: 3, tpm: 3 };
const SLAB = 2;
const OX = 5;
export function dq(y) {
  for (let i = 1; i < DEPTH.length; i++) {
    const [y0, q0] = DEPTH[i - 1], [y1, q1] = DEPTH[i];
    if (y >= y1) return Math.round(q0 + ((y0 - y) / (y0 - y1)) * (q1 - q0));
  }
  return DEPTH[DEPTH.length - 1][1];
}
const ascii = (s) => s.replace(/[’‘]/g, "'").replace(/[^\x20-\x7e·]/g, "").replace(/\s+/g, " ").trim();
const fit = (s, n) => (s.length <= n ? s : s.slice(0, Math.max(0, n - 1)) + "~");

/** Which component a board point sits on, if any. */
function compAt(comps, x, y) {
  for (const [k, c] of Object.entries(comps)) if (x >= c.x && x <= c.x + c.w - 1 && y >= c.y && y <= c.y + c.h - 1) return k;
  return null;
}

/**
 * The static scene for one board: { w, h, cells, boxes, at(x, y) }.
 * `cells[row][col]` is { c, fg, bg } or null; `boxes[k]` is a component's screen box
 * { L, R, T, d, z } (front-left column, front-right column, front-top row, depth, height);
 * `at(x, y)` projects a board point onto whatever it sits on → { x: col, y: row }.
 */
export function isoScene(comps, machine) {
  const OY = Math.max(dq(-1), ...Object.entries(comps).map(([k, c]) => dq(c.y) + (Z[k] ?? 2))) + 1;
  const w = OX + W + dq(-1) + 3, h = OY + SLAB + 1;
  const cells = Array.from({ length: h }, () => new Array(w).fill(null));
  const put = (x, y, c, fg, bg) => {
    if (y < 0 || y >= h || x < 0 || x >= w) return;
    const prev = cells[y][x];
    cells[y][x] = { c, fg, bg: bg === undefined ? prev?.bg ?? null : bg };
  };
  const text = (x, y, s, fg) => { [...s].forEach((c, i) => put(x + i, y, c, fg)); };

  /** One raised block. Footprint in board coords; `z` rows tall. */
  const box = ({ x, x1, back, front, z, edge, tint, flat }) => {
    const L = OX + x + dq(front), R = OX + x1 + dq(front);
    const d = Math.max(1, dq(back) - dq(front));
    const T = OY - dq(front) - z;
    // Only faces with straight sides are shaded: a slanted edge on a character grid shades as stairs.
    const top = flat ? null : `${tint}/24`, face = `${tint}/14`, side = null;
    for (let k = 1; k < d; k++) for (let c = L + k + 1; c <= R + k - 1; c++) put(c, T - k, " ", edge, top);
    for (let c = L + d; c <= R + d - 1; c++) put(c, T - d, "_", edge, null);
    for (let c = L + 1; c <= R - 1; c++) put(c, T, "_", edge, top);
    for (let k = 0; k < d; k++) { put(L + k, T - k, "/", edge, null); put(R + k, T - k, "/", edge, null); }
    for (let r = T - d + 1; r <= T + z; r++) {
      const lo = r <= T ? R + (T - r) + 1 : R + 1;
      const hi = r <= T + z - d ? R + d - 1 : R + (T + z + 1 - r) - 1;
      for (let c = lo; c <= hi; c++) put(c, r, " ", edge, side);
    }
    for (let r = T - d + 1; r <= T + z - d; r++) put(R + d, r, "|", edge, null);
    for (let k = 1; k <= d; k++) put(R + k, T + z + 1 - k, "/", edge, null);
    for (let r = T + 1; r <= T + z; r++) {
      put(L, r, "|", edge, null);
      put(R, r, "|", edge, null);
      for (let c = L + 1; c <= R - 1; c++) put(c, r, r === T + z ? "_" : " ", edge, face);
    }
    return { L, R, T, d, z };
  };
  /** A point on the top face of a box (or the board) → screen cell. */
  const onTop = (x, y, z) => ({ x: OX + x + dq(y), y: OY - dq(y) - z });

  // The board itself, its texture, holes and silkscreen.
  const slab = box({ x: -3, x1: W, back: -1, front: H, z: SLAB, edge: "frame", tint: "frame", flat: true });
  for (let k = 1; k < slab.d; k++) for (let c = slab.L + k + 2; c <= slab.R + k - 2; c++) if ((c * 3 + k * 5) % 11 === 0) put(c, slab.T - k, ".", "deco");
  for (const x of [-1, W - 1]) { const p = onTop(x, 0, 0); put(p.x, p.y, "o", "silk"); }
  text(OX + 3, OY + 1, "HRD-X870 · AGENT BOARD · rev 1.0", "silk");
  const name = ascii(machine ?? "").slice(0, 40);
  text(OX + W - 2 - name.length, OY + 1, name, "silk");

  // Buses run across, lanes and pads run into the screen.
  for (const bus of [BUS1, BUS2]) {
    const xs = [...LANES, ...Object.values(comps).filter((c) => busOf(c) === bus).map(padX)];
    for (let x = Math.min(...xs); x <= Math.max(...xs); x++) { const p = onTop(x, bus, 0); put(p.x, p.y, "=", "bus"); }
  }
  const depthLine = (x, y0, y1, fg) => { for (let q = Math.min(dq(y0), dq(y1)); q <= Math.max(dq(y0), dq(y1)); q++) put(OX + x + q, OY - q, "/", fg); };
  for (const lx of LANES) depthLine(lx, BUS1, BUS2, "trace");
  for (const c of Object.values(comps)) depthLine(padX(c), c.band === "top" ? c.y + c.h - 1 : busOf(c), c.band === "top" ? BUS1 : c.y, "trace");

  // Components back to front, left to right, so nearer blocks cover farther ones.
  const boxes = {};
  const order = Object.entries(comps).sort(([, a], [, b]) => a.y + a.h - (b.y + b.h) || a.x - b.x);
  for (const [k, c] of order) {
    const z = Z[k] ?? 2;
    const b = (boxes[k] = box({ x: c.x, x1: c.x + c.w - 1, back: c.y, front: c.y + c.h - 1, z, edge: c.role, tint: c.role }));
    const label = k === "cpu0" ? `CPU · ${ascii(machine ?? "")}` : ascii(c.title ?? LABEL[k]);
    text(b.L + 2, b.T + 1, fit(label, b.R - b.L - 3), c.role);
    text(b.L + 2, b.T + 2, fit(k === "gpu" ? "terminals other agents started" : MEANS[k] ?? "", b.R - b.L - 3), "dim");
    // Top-face detail: fins, DIMM sticks, slot teeth.
    const rows = []; for (let k2 = 1; k2 < b.d; k2++) rows.push(b.T - k2);
    if (k === "cpu0") rows.forEach((r) => { for (let col = b.L + (b.T - r) + 2; col <= b.R + (b.T - r) - 2; col += 2) put(col, r, "|", "deco"); });
    if (k === "ram") rows.forEach((r, i) => { if (i % 2 === 0) for (let col = b.L + (b.T - r) + 2; col <= b.R + (b.T - r) - 2; col++) put(col, r, "=", "deco"); });
    if (k === "gpu") rows.forEach((r) => { for (let col = b.L + (b.T - r) + 12; col <= b.R + (b.T - r) - 2; col += 3) put(col, r, "|", "deco"); });
    if (k === "nic") { const r = b.T - 1; text(b.L + 3, r, "[RJ45]", "nic"); }
    if (k === "nvme") rows.forEach((r) => { for (let col = b.L + (b.T - r) + 8; col <= b.R + (b.T - r) - 3; col += 3) text(col, r, "[]", "deco"); });
  }

  const at = (x, y) => {
    const k = compAt(comps, x, y);
    return onTop(x, y, k ? Z[k] ?? 2 : 0);
  };
  return { w, h, cells, boxes, at };
}

/** Rows of cells → runs of one color pair: [{ x, y, s, fg, bg }]. Plain spaces with no bg are skipped. */
export function runsOf(cells) {
  const out = [];
  cells.forEach((row, y) => {
    let cur = null;
    row.forEach((cell, x) => {
      if (!cell || (cell.c === " " && !cell.bg)) { cur = null; return; }
      if (cur && cur.fg === cell.fg && cur.bg === cell.bg && cur.x + cur.s.length === x) { cur.s += cell.c; return; }
      cur = { x, y, s: cell.c, fg: cell.fg, bg: cell.bg };
      out.push(cur);
    });
  });
  return out;
}

/** The screen cells a move segment crosses, each with the glyph for its step. */
export function isoTrail(at, from, to) {
  const a = at(from[0], from[1]), b = at(to[0], to[1]);
  const glyph = (dx, dy) => (dy === 0 ? "=" : dx === 0 ? "|" : dx === -dy ? "/" : "\\");
  const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  const out = [];
  let px = a.x, py = a.y;
  for (let i = 0; i <= n; i++) {
    const x = Math.round(a.x + ((b.x - a.x) * i) / (n || 1)), y = Math.round(a.y + ((b.y - a.y) * i) / (n || 1));
    out.push({ x, y, c: i === 0 ? glyph(Math.sign(b.x - a.x), Math.sign(b.y - a.y)) : glyph(Math.sign(x - px), Math.sign(y - py)) });
    px = x; py = y;
  }
  return out;
}

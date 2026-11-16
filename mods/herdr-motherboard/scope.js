// The scope view: a logic analyzer. Each agent is a channel; its trace shows where it has
// been over the last few minutes, drawn with ASCII on two rows:
//
//    RAM · idle ____________          ______
//   ______/ CPU · thinking \________|x BIOS xx|
//
// High is working (CPU, PCH, NIC, NVMe, PCIe), low is idle or finished, hatched means it
// needs you or failed. Pure: no herdr or gpui-kit imports.

import { LABEL, MEANS } from "./board.js";

/** Time spans the scope can show, in ms. */
export const SPANS = [60e3, 3 * 60e3, 10 * 60e3];
export const spanLabel = (ms) => `${Math.round(ms / 60e3)}m`;
const HIGH = new Set(["cpu0", "pch", "nic", "nvme", "gpu"]);
const ALERTS = new Set(["bios", "panel", "tpm", "fault"]);
/** 0: not seen yet, 1: low, 2: high, 3: needs you / failed. */
export const level = (comp) => (!comp ? 0 : HIGH.has(comp) ? 2 : ALERTS.has(comp) ? 3 : 1);

/** Where an agent was at the end of each column; null before it was first seen. `hist`: [{t, comp}] by time. */
export function sample(hist, now, span, cols) {
  const out = new Array(cols).fill(null);
  const t0 = now - span;
  let j = -1;
  for (let c = 0; c < cols; c++) {
    const t = t0 + ((c + 1) * span) / cols;
    while (j + 1 < hist.length && hist[j + 1].t <= t) j++;
    out[c] = j >= 0 ? hist[j].comp : null;
  }
  return out;
}

/** History kept: everything inside the longest span, plus the entry in force at its start. */
export function prune(hist, now) {
  const cut = now - SPANS[SPANS.length - 1];
  let i = 0;
  while (i + 1 < hist.length && hist[i + 1].t <= cut) i++;
  return i ? hist.slice(i) : hist;
}

/**
 * Columns → the trace: { hi, lo, segs }. `hi`/`lo` are runs [{ x, s, comp }] for the upper and
 * lower row; `segs` are the stretches of one component [{ from, to, comp }] (columns, inclusive).
 */
export function wave(states) {
  const n = states.length;
  const hi = new Array(n).fill(" "), lo = new Array(n).fill(" ");
  for (let c = 0; c < n; c++) {
    const s = states[c], L = level(s);
    if (!L) continue;
    if (L === 2) hi[c] = "_";
    if (L === 1) lo[c] = "_";
    if (L === 3) { hi[c] = "_"; lo[c] = "x"; }
    const p = c ? states[c - 1] : s, PL = level(p);
    if (c && p !== s && PL) {
      if (PL === 1 && L >= 2) { lo[c] = "/"; hi[c] = " "; }
      else if (PL >= 2 && L === 1) { lo[c] = "\\"; hi[c] = " "; }
      else lo[c] = "|";
    }
  }
  const segs = [];
  for (let c = 0; c < n; c++) {
    if (!states[c]) continue;
    const last = segs[segs.length - 1];
    if (last && last.comp === states[c] && last.to === c - 1) last.to = c;
    else segs.push({ from: c, to: c, comp: states[c] });
  }
  // Name each stretch where its row is empty: inside a raised one, above a low one.
  for (const g of segs) {
    const row = level(g.comp) < 2 ? hi : lo;
    const room = g.to - g.from - 1;
    const long = `${LABEL[g.comp] ?? g.comp} · ${MEANS[g.comp] ?? ""}`, short = LABEL[g.comp] ?? g.comp;
    const name = room >= long.length + 2 ? long : short;
    if (room < name.length + 2) continue;
    [...` ${name} `].forEach((ch, i) => { row[g.from + 1 + i] = ch; });
  }
  const runs = (row) => {
    const out = [];
    for (let c = 0; c < n; c++) {
      if (row[c] === " ") continue;
      const last = out[out.length - 1];
      if (last && last.comp === states[c] && last.x + last.s.length === c) last.s += row[c];
      else out.push({ x: c, s: row[c], comp: states[c] });
    }
    return out;
  };
  return { hi: runs(hi), lo: runs(lo), segs };
}

/** Tick marks for the time axis: [{ x, label }], one every `every` ms back from now. */
export function ticks(span, cols) {
  const every = span <= 60e3 ? 10e3 : span <= 3 * 60e3 ? 30e3 : 120e3;
  const out = [];
  for (let back = every; back < span; back += every) {
    const x = Math.round(cols - 1 - (back / span) * cols);
    const s = Math.round(back / 1000);
    out.push({ x, label: s < 60 ? `-${s}s` : `-${Math.floor(s / 60)}m${s % 60 ? String(s % 60).padStart(2, "0") : ""}` });
  }
  return out;
}

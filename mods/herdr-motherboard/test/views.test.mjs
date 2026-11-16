import test from "node:test";
import assert from "node:assert/strict";
import { buildBoard, buildSlots, route, BUS1, BUS2, LANES } from "../board.js";
import { isoScene, runsOf, isoTrail } from "../iso.js";
import { sample, wave, prune, ticks, SPANS } from "../scope.js";

const board = buildBoard({ machine: "Test’s Mac", online: true });
const sc = isoScene(board.comps, "Test’s Mac");

test("iso: every block and the board fit the scene", () => {
  for (const b of Object.values(sc.boxes)) {
    assert.ok(b.L >= 0 && b.R + b.d < sc.w, "columns");
    assert.ok(b.T - b.d >= 0 && b.T + b.z < sc.h, "rows");
  }
  for (const row of sc.cells) assert.equal(row.length, sc.w);
});

test("iso: both buses show between the blocks", () => {
  for (const bus of [BUS1, BUS2]) {
    const p = sc.at(LANES[0] + 2, bus);
    assert.equal(sc.cells[p.y][p.x]?.c, "=", `bus at y=${bus}`);
  }
});

test("iso: every slot lands on its block's top face", () => {
  const slots = buildSlots(board.comps, 6);
  for (const [k, list] of Object.entries(slots)) {
    const b = sc.boxes[k];
    for (const s of list) {
      const p = sc.at(s.x, s.y);
      assert.ok(p.y <= b.T - 1 && p.y >= b.T - b.d + 1, `${k} slot row ${p.y} on top face ${b.T - b.d + 1}..${b.T - 1}`);
    }
  }
});

test("iso: trails are unbroken and runs cover every visible cell", () => {
  const slots = buildSlots(board.comps, 6);
  const pts = route(board.comps, "ram", slots.ram[0], "nvme", slots.nvme[0]);
  for (let i = 1; i < pts.length; i++) {
    const cells = isoTrail(sc.at, pts[i - 1], pts[i]);
    for (let j = 1; j < cells.length; j++) assert.ok(Math.abs(cells[j].x - cells[j - 1].x) <= 1 && Math.abs(cells[j].y - cells[j - 1].y) <= 1);
  }
  const runs = runsOf(sc.cells);
  const covered = runs.reduce((n, r) => n + r.s.length, 0);
  const visible = sc.cells.flat().filter((c) => c && !(c.c === " " && !c.bg)).length;
  assert.equal(covered, visible);
});

test("scope: samples history into columns and draws levels", () => {
  const now = 100_000, span = 60_000;
  const hist = [{ t: 40_000, comp: "ram" }, { t: 70_000, comp: "cpu0" }, { t: 85_000, comp: "bios" }];
  const st = sample(hist, now, span, 60);
  assert.equal(st[0], "ram");
  assert.equal(st[29], "cpu0");
  assert.equal(st[59], "bios");
  const w = wave(st);
  assert.deepEqual(w.segs.map((g) => g.comp), ["ram", "cpu0", "bios"]);
  const lo = w.lo.map((r) => r.s).join("");
  assert.ok(lo.includes("/") && lo.includes("CPU") && lo.includes("x"));
  assert.equal(sample([{ t: 99_000, comp: "cpu0" }], now, span, 10)[0], null);
});

test("scope: prune keeps what the longest span needs; ticks stay on the axis", () => {
  const now = 1e9, big = SPANS[SPANS.length - 1];
  const hist = [{ t: now - big - 50e3, comp: "ram" }, { t: now - big - 10e3, comp: "cpu0" }, { t: now - 1000, comp: "pch" }];
  assert.deepEqual(prune(hist, now).map((h) => h.comp), ["cpu0", "pch"]);
  for (const span of SPANS) for (const t of ticks(span, 120)) assert.ok(t.x >= 0 && t.x < 120);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROLES, DEFAULT_THEME, parseTheme, themeOrder, palette, chipColors, themeFile } from "../themes.js";

const active = { background: "#000000", foreground: "#ffffff", border: "#222222", input: "#333333", chrome: "#111111", muted: "#999999", dim: "#666666", popover: "#0a0a0a", working: "#00aaff" };
for (let i = 0; i < 16; i++) active[`ansi${i}`] = `#0000${String(i).padStart(2, "0")}`;
const defs = (...files) => new Map([[DEFAULT_THEME, { id: DEFAULT_THEME, name: "Herdr", colors: {}, programs: {} }], ...files.map((f) => [f.id, f])]);

test("the default theme follows the active Herdr theme for every role", () => {
  const P = palette("herdr", defs(), active);
  assert.equal(P.bg, "#000000");
  assert.equal(P.cpu, active.ansi4);
  assert.equal(P.chipBg, null);
  assert.deepEqual(P.warnings, []);
  for (const [role, [d]] of Object.entries(ROLES)) if (d) assert.ok(P[role], role);
});

test("a theme takes hex or Herdr color names, extends another, and can unset a role", () => {
  const base = parseTheme("base", JSON.stringify({ colors: { cpu: "#123456", ram: "ansi1" }, scanlines: true }));
  const child = parseTheme("child", JSON.stringify({ extends: "base", colors: { ram: "#abc", chipBg: "#010203" } }));
  const P = palette("child", defs(base, child), active);
  assert.equal(P.cpu, "#123456");
  assert.equal(P.ram, "#abc");
  assert.equal(P.chipBg, "#010203");
  assert.equal(P.scan, true);
  const off = palette("x", defs(parseTheme("x", JSON.stringify({ extends: "child", colors: { chipBg: null } })), base, child), active);
  assert.equal(off.chipBg, null);
});

test("bad values fall back and are reported; bad files throw", () => {
  const t = parseTheme("t", JSON.stringify({ colors: { cpu: "blue-ish", nope: "#fff" } }));
  const P = palette("t", defs(t), active);
  assert.equal(P.cpu, active.ansi4);
  assert.equal(P.warnings.length, 2);
  assert.throws(() => parseTheme("t", "{ not json"));
  assert.throws(() => parseTheme("t", JSON.stringify({ colors: [] })));
});

test("herdrTheme borrows another Herdr theme's colors, asked only when used", () => {
  let asked = 0;
  const list = () => { asked++; return [{ name: "mocha", colors: { ...active, ansi4: "#89b4fa" } }]; };
  assert.equal(palette("herdr", defs(), active, list).cpu, active.ansi4);
  assert.equal(asked, 0);
  assert.equal(palette("m", defs(parseTheme("m", JSON.stringify({ herdrTheme: "mocha" }))), active, list).cpu, "#89b4fa");
});

test("chips color by program unless the theme sets one chip color", () => {
  const P = palette("herdr", defs(parseTheme("herdr", JSON.stringify({ programs: { claude: "#ff0000", myagent: "ansi2" } }))), active);
  assert.equal(chipColors({ program: { key: "claude" } }, P).bg, "#ff0000");
  assert.equal(chipColors({ app: "myagent" }, P).bg, active.ansi2);
  assert.equal(chipColors({ app: "unknown" }, P).bg, P.programs.other);
});

test("shipped theme files parse cleanly and a copied theme reproduces its palette", () => {
  const dir = new URL("../themes/", import.meta.url);
  const shipped = ["herdr", "phosphor"].map((id) => parseTheme(id, readFileSync(new URL(`${id}.json`, dir), "utf8")));
  const all = defs(...shipped);
  assert.deepEqual(themeOrder(all), ["herdr", "phosphor"]);
  const P = palette("phosphor", all, active);
  assert.deepEqual(P.warnings, []);
  const copy = parseTheme("copy", themeFile("copy", P));
  const Q = palette("copy", defs(copy), { background: "#ffffff" });
  for (const role of Object.keys(ROLES)) assert.equal(Q[role], P[role], role);
});

test("every shipped theme parses cleanly and stays readable", async () => {
  const { readdirSync } = await import("node:fs");
  const dir = new URL("../themes/", import.meta.url);
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const files = readdirSync(dir).filter((n) => n.endsWith(".json"));
  assert.ok(files.length >= 7);
  for (const n of files) {
    const id = n.slice(0, -5);
    const t = parseTheme(id, readFileSync(new URL(n, dir), "utf8"));
    const P = palette(id, defs(t), active);
    assert.deepEqual(P.warnings, [], id);
    if (id === "herdr") continue;
    assert.ok(contrast(P.text, P.bg) >= 7, `${id}: text`);
    assert.ok(contrast(P.muted, P.bg) >= 4.5, `${id}: muted`);
    for (const role of ["cpu", "ram", "nvme", "pch", "nic", "gpu", "bios", "panel", "tpm", "fault", "post", "lit"]) assert.ok(contrast(P[role], P.bg) >= 3, `${id}: ${role} ${contrast(P[role], P.bg).toFixed(2)}`);
    const chip = P.chipBg ? [P.chipBg] : Object.values(P.programs);
    for (const c of chip) assert.ok(contrast(P.chipFg, c) >= 4.5, `${id}: chip text on ${c}`);
  }
});

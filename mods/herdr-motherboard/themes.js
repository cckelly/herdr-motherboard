// Board themes. Each theme is a JSON file in ./themes (see themes/README.md):
//   { "name", "extends"?, "herdrTheme"?, "scanlines"?, "colors"?: {role: value}, "programs"?: {key: value} }
// A value is a hex color ("#7dff9a") or a Herdr theme color name ("ansi4", "background").
// Roles a theme leaves out come from what it extends, and finally from ROLES below, which
// follows the active Herdr theme. Pure: no herdr or gpui-kit imports.

/** Every role the board paints: [default (a Herdr color name or hex, or null for none), what it paints]. */
export const ROLES = {
  bg: ["background", "board and window background"],
  head: ["chrome", "header, machines row and log bar"],
  line: ["border", "dividers between bars"],
  text: ["foreground", "main text"],
  muted: ["muted", "secondary text"],
  dim: ["dim", "faint text"],
  frame: ["input", "board frame and component outlines"],
  silk: ["dim", "silkscreen labels (MH1, rev, VCORE)"],
  trace: ["border", "pad traces and lanes"],
  bus: ["input", "data buses at rest"],
  deco: ["border", "decoration (DIMM strips, fins, L3)"],
  lit: ["ansi14", "lit bus trail, highlights, active buttons"],
  cpu: ["ansi4", "CPU: thinking"],
  ram: ["ansi12", "RAM: idle"],
  nvme: ["ansi5", "NVMe: files changing"],
  pch: ["ansi6", "PCH: running a command"],
  nic: ["ansi2", "NIC: network command"],
  gpu: ["ansi13", "PCIe: sub-agents"],
  bios: ["ansi1", "BIOS: needs permission"],
  panel: ["ansi3", "F_PANEL: asked a question"],
  tpm: ["ansi11", "TPM: needs a login"],
  fault: ["ansi9", "FAULT: error"],
  post: ["ansi10", "POST: finished"],
  remote: ["ansi14", "other machines' names"],
  led: ["ansi10", "status LEDs"],
  working: ["working", "working counts"],
  card: ["popover", "hover cards and menus"],
  cardLine: ["border", "hover card and menu borders"],
  agentBg: [null, "one color for every agent (unset: color agents by program)"],
  agentFg: ["#11111b", "agent text"],
  agentRing: [null, "agent outline (unset: none)"],
};

/** Agent colors by program key (matched against the program and app names); "other" for the rest. */
export const PROGRAMS = {
  claude: "#e0896b", codex: "#c9d1e3", opencode: "#f2c46d", pi: "#a99bf5", cursor: "#8fd3c9",
  gemini: "#8ab4f8", kiro: "#b8e986", amp: "#f5a3c7", other: "#b4befe",
};

/** The theme every list starts with; it needs no file. */
export const DEFAULT_THEME = "herdr";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** One theme file → its definition. Throws with a readable message on a bad file. */
export function parseTheme(id, text) {
  const j = JSON.parse(text);
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("expected a JSON object");
  for (const k of ["colors", "programs"]) if (j[k] != null && (typeof j[k] !== "object" || Array.isArray(j[k]))) throw new Error(`"${k}" must be an object`);
  const unknown = Object.keys(j.colors ?? {}).filter((r) => !(r in ROLES));
  return {
    id, name: typeof j.name === "string" ? j.name : id, extends: j.extends ?? null, herdrTheme: j.herdrTheme ?? null,
    scanlines: j.scanlines, colors: j.colors ?? {}, programs: j.programs ?? {},
    warnings: unknown.map((r) => `${id}: unknown role "${r}"`),
  };
}

/** Theme ids in menu order: the default first, then the rest by id. */
export function themeOrder(defs) {
  return [...defs.keys()].sort((a, b) => (a === DEFAULT_THEME ? -1 : b === DEFAULT_THEME ? 1 : a.localeCompare(b)));
}

/**
 * A theme id → the palette the board draws with: {role: color, programs, scan, warnings}.
 * `defs`: Map id → definition; `active`: theme() colors; `herdrThemes`: () → themes() list, asked only when needed.
 */
export function palette(id, defs, active, herdrThemes = () => []) {
  const chain = [];
  const seen = new Set();
  for (let d = defs.get(id) ?? defs.get(DEFAULT_THEME); d && !seen.has(d.id); d = d.extends ? defs.get(d.extends) : null) {
    seen.add(d.id);
    chain.unshift(d);
  }
  const pick = (k) => chain.reduce((v, d) => d[k] ?? v, null);
  const colors = Object.assign({}, ...chain.map((d) => d.colors));
  const herdrTheme = pick("herdrTheme");
  const borrowed = herdrTheme ? herdrThemes().find((x) => x.name === herdrTheme)?.colors : null;
  const src = borrowed ?? active ?? {};
  const warnings = chain.flatMap((d) => d.warnings ?? []);
  if (herdrTheme && !borrowed) warnings.push(`no Herdr theme named "${herdrTheme}"; using the active one`);
  const color = (v) => (v == null ? null : HEX.test(v) ? v : src[v] ?? null);
  const P = {};
  for (const [role, [fallback]] of Object.entries(ROLES)) {
    const v = colors[role];
    if (v != null && color(v) == null) warnings.push(`${role}: "${v}" is not a hex color or a Herdr color name`);
    P[role] = v === null ? null : color(v) ?? color(fallback) ?? (role === "card" ? src.surface ?? src.background : null);
  }
  const programs = Object.assign({}, PROGRAMS, ...chain.map((d) => d.programs));
  for (const k of Object.keys(programs)) programs[k] = color(programs[k]) ?? PROGRAMS[k] ?? PROGRAMS.other;
  P.programs = programs;
  P.scan = !!pick("scanlines");
  P.warnings = warnings;
  return P;
}

/** A chip's background and text color under a palette. */
export function chipColors(r, P) {
  if (P.agentBg) return { bg: P.agentBg, fg: P.agentFg };
  const k = `${r.program?.key ?? ""} ${r.app ?? ""}`.toLowerCase();
  const hit = Object.keys(P.programs).find((n) => n !== "other" && k.includes(n));
  return { bg: P.programs[hit ?? "other"], fg: P.agentFg };
}

/** A palette written out as a standalone theme file (every role as a concrete color). */
export function themeFile(name, P) {
  const colors = {};
  for (const role of Object.keys(ROLES)) colors[role] = P[role];
  return JSON.stringify({ name, scanlines: P.scan, colors, programs: P.programs }, null, 2) + "\n";
}

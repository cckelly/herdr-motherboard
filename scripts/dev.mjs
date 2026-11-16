#!/usr/bin/env node
// Develop against the repo: copies mods/herdr-motherboard into Herdr's mods folder, then copies
// each file again as you save it, so the running board hot-reloads your change.
//
//   node scripts/dev.mjs
//
// Herdr loads a symlinked mod but doesn't hot-reload it, hence a copy. Herdr's home is
// ~/.config/herdr-app unless HERDR_APP_HOME says otherwise. Files Herdr writes into the mod
// folder (gpui-kit.d.ts, jsconfig.json) are left alone. Ctrl-C stops.

import { cpSync, existsSync, mkdirSync, rmSync, statSync, watch } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "herdr-motherboard";
const src = join(dirname(fileURLToPath(import.meta.url)), "..", "mods", NAME);
const home = process.env.HERDR_APP_HOME || join(homedir(), ".config", "herdr-app");
const dest = join(home, "mods", NAME);
const skip = (rel) => /(^|[\\/])(\.DS_Store|gpui-kit\.d\.ts|jsconfig\.json)$/.test(rel);

if (!existsSync(home)) {
  console.error(`No Herdr home at ${home}. Install Herdr, or set HERDR_APP_HOME.`);
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true, filter: (from) => !skip(relative(src, from)) });
console.log(`Copied ${relative(process.cwd(), src) || src} → ${dest}`);
console.log("Watching for changes. Ctrl-C stops.");

// Editors often save by writing a temp file and renaming it, so one save can fire several
// events; copying the same file twice is harmless.
watch(src, { recursive: true }, (_event, rel) => {
  if (!rel || skip(rel)) return;
  const from = join(src, rel), to = join(dest, rel);
  try {
    if (!existsSync(from)) { rmSync(to, { recursive: true, force: true }); console.log(`removed ${rel}`); return; }
    if (statSync(from).isDirectory()) { mkdirSync(to, { recursive: true }); return; }
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
    console.log(`copied ${rel}`);
  } catch (e) {
    console.error(`${rel}: ${e.message}`);
  }
});

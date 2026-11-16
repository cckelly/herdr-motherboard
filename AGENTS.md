# AGENTS.md

A Herdr mod that draws every agent on an ASCII motherboard. Read [CONTRIBUTING.md](CONTRIBUTING.md)
for the layout and the dev loop, and [RECIPE.md](RECIPE.md) for the full spec; its "Watch out"
section lists the traps already found.

## Commands

- Dev loop: `node scripts/dev.mjs` copies `mods/herdr-motherboard/` into Herdr's mods folder and
  keeps copying on save. Edit in the repo, never in `~/.config/herdr-app/mods/`.
- Tests: `node --test mods/herdr-motherboard/test/*.test.mjs` (pure modules; `main.js` needs
  Herdr and has no unit tests).
- Load check: `herdr-app check mods/herdr-motherboard`. It doesn't run `render`, so a drawing
  change still needs a look at the board.

## Rules

- Change RECIPE.md in the same commit as any behavior change. Herdr's agents rebuild the mod
  from it.
- No network access. Any new program the mod runs or file it reads goes in "What it runs and
  reads" (RECIPE.md) and "What it runs" (README.md).
- In everything a person reads, the moving boxes are "agents", not "chips". Internal names like
  `chipEl` can stay.
- Theme files are a public format: renaming a color role breaks people's themes.
- Docs use American English.

## Working in someone's Herdr

- The board is on their screen. Don't drive their pointer or keyboard, and don't open the board
  or take screenshots while they're working unless they've said it's fine.
- `herdr-app shot` captures Herdr's whole window, sidebar included. For screenshots: turn on
  demo, set names to space, check `herdr-app status` lists `herdr-motherboard` under `overlays`
  right before each shot (saving `main.js` can close the window), and crop to the board.
- After saving `main.js`, wait about 3 seconds before sending the board a command; an earlier
  one can reach the old build.
- Mod commands (`herdr-app do herdr-motherboard.<name>`) reach only an open board.

# Contributing

Thanks for wanting to make the board better. Bug reports, ideas, themes and code are all welcome.

## Reporting a bug or an idea

Open an [issue](https://github.com/cckelly/herdr-motherboard/issues/new/choose). For a bug, the
form asks for your Herdr version, OS and which agents were on the board. A screenshot helps more
than anything else.

## Sharing a theme

A theme is one JSON file (see [Make your own](README.md#make-your-own)). To ship one with the mod,
add it to `mods/herdr-motherboard/themes/` in a pull request with a screenshot. The tests check
every shipped theme's text contrast, so run them first.

## Working on the code

You need [Herdr](https://herdr.dev) and Node 22 or later. Nothing to install: the mod has no
dependencies.

```sh
git clone https://github.com/cckelly/herdr-motherboard
cd herdr-motherboard
node scripts/dev.mjs
```

`scripts/dev.mjs` copies the mod into Herdr's mods folder (`~/.config/herdr-app/mods/`, or
`$HERDR_APP_HOME/mods/`) and copies each file again when you save it. Herdr hot-reloads the
board, so leave the script running and edit in the repo. If you already have the mod installed,
the script replaces that copy with yours. Herdr loads a symlinked mod but doesn't hot-reload it,
which is why it copies.

Open the board with `cmd-shift-m` (`ctrl-shift-m` off macOS). Turn on `demo` in its header for
seven simulated agents, which you can also message and answer (`demo.js` plays their terminals).
To try the real path through `hc`, run the pretend agent in a Herdr tab:

```sh
node mods/herdr-motherboard/test/echo-agent.mjs
```

Send it `ask` for a question or `allow` for a permission prompt.

### Before you open a pull request

```sh
node --test mods/herdr-motherboard/test/*.test.mjs
herdr-app check mods/herdr-motherboard
```

CI runs the tests on Linux, macOS and Windows. `herdr-app check` loads the mod once and reports
errors, but it doesn't draw it, so look at your change on the board too, and include a screenshot
for anything visible. Use demo mode for screenshots so they show none of your own agents or
machine names.

- **Keep [RECIPE.md](RECIPE.md) in step with the code.** It's the brief Herdr's agents use to
  rebuild the mod from scratch, so a behavior change without its RECIPE change is a bug.
- **Say what it runs.** The mod has no network access of its own and tells people exactly which
  programs it runs and which files it reads. A change that adds one updates "What it runs and
  reads" in RECIPE.md and "What it runs" in the README.
- **Small and focused.** One change per pull request, matching the code around it.
- **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org):
  `fix: …`, `feat: …`, `docs: …`.

## Where things are

| Path | What |
| --- | --- |
| `mods/herdr-motherboard/main.js` | the view: header, board, cards, menus, keys, and watching agents |
| `board.js` · `iso.js` · `scope.js` | the flat board's geometry and routes, the 3D view, the timeline |
| `model.js` | where an agent goes, parsing processes and prompts |
| `themes.js` · `themes/*.json` | theme parsing and the shipped themes |
| `platform.js` | per-OS commands (`ps`, PowerShell, opening files) |
| `demo.js` | the simulated agents |
| `test/` | unit tests for everything but `main.js`, and the echo agent |
| `RECIPE.md` | the full spec: what you see, how it behaves, what it's built from, what to watch out for |

The "Watch out" section of RECIPE.md lists the traps we've already fallen into. Read it before
changing how the board draws or handles the pointer.

## License

By contributing, you agree your work is released under the [MIT license](LICENSE).

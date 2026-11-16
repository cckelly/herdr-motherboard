# Motherboard themes

Every `.json` file in this folder is a theme. The board picks it up as soon as you save
(`theme ▾` in the header lists them; `c` cycles). A broken file is skipped, and the
theme menu says why.

```json
{
  "name": "Midnight",
  "extends": "phosphor",
  "herdrTheme": "catppuccin-mocha",
  "scanlines": false,
  "colors": { "cpu": "#89b4fa", "bios": "ansi1", "chipBg": null },
  "programs": { "claude": "#ff9e64", "my-agent": "#9ece6a" }
}
```

- **name**: what the menu shows. The file name without `.json` is the theme id.
- **extends**: another theme id. Anything this file leaves out comes from that one.
- **herdrTheme**: color names resolve against this Herdr theme (any name in Herdr's theme
  list) instead of the one Herdr is using right now.
- **scanlines**: CRT scanlines over the board.
- **colors**: role → a hex color (`#rgb`, `#rrggbb`, `#rrggbbaa`) or a Herdr color name
  (`background`, `foreground`, `muted`, `dim`, `border`, `input`, `chrome`, `popover`,
  `accent`, `working`, `blocked`, `done`, `idle`, `ansi0`..`ansi15`, …). `null` unsets a
  role that can be unset. Roles you leave out use the defaults below, which follow the Herdr theme.
- **programs**: chip color per program, matched against the agent's program and app names
  (`other` is everything else). Ignored while `chipBg` is set.

The theme menu's **Copy to a new theme** writes the current theme out with every role filled
in, which is the easiest place to start.

| Role | Default | Paints |
| --- | --- | --- |
| `bg` | `background` | board and window background |
| `head` | `chrome` | header, machines row and log bar |
| `line` | `border` | dividers between bars |
| `text` | `foreground` | main text |
| `muted` | `muted` | secondary text |
| `dim` | `dim` | faint text |
| `frame` | `input` | board frame and component outlines |
| `silk` | `dim` | silkscreen labels (MH1, rev, VCORE) |
| `trace` | `border` | pad traces and lanes |
| `bus` | `input` | data buses at rest |
| `deco` | `border` | decoration (DIMM strips, fins, L3) |
| `lit` | `ansi14` | lit bus trail, highlights, active buttons |
| `cpu` | `ansi4` | CPU: thinking |
| `ram` | `ansi12` | RAM: idle |
| `nvme` | `ansi5` | NVMe: files changing |
| `pch` | `ansi6` | PCH: running a command |
| `nic` | `ansi2` | NIC: network command |
| `gpu` | `ansi13` | PCIe: sub-agents |
| `bios` | `ansi1` | BIOS: needs permission |
| `panel` | `ansi3` | F_PANEL: asked a question |
| `tpm` | `ansi11` | TPM: needs a login |
| `fault` | `ansi9` | FAULT: error |
| `post` | `ansi10` | POST: finished |
| `remote` | `ansi14` | other machines' names |
| `led` | `ansi10` | status LEDs |
| `working` | `working` | working counts |
| `card` | `popover` | hover cards and menus |
| `cardLine` | `border` | hover card and menu borders |
| `chipBg` | unset | one color for every agent chip (unset: color chips by program) |
| `chipFg` | `#11111b` | chip text |
| `chipRing` | unset | chip outline (unset: none) |

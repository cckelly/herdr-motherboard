# Changelog

All notable changes to Motherboard are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-17

The first release.

### Added

- Every agent Herdr knows about appears on an ASCII motherboard and travels the buses to the
  component that matches what it's doing: CPU (thinking), PCH (running a command), NIC
  (network commands), NVMe (files changing in its repo), PCIe (sub-agents), BIOS / F_PANEL /
  TPM (waiting on you), FAULT, POST and RAM.
- Works with any agent that reports a status, refined by the agent's child processes and its
  repo's file changes. No hooks or setup per agent, and no network access of its own.
- Cards: hover an agent for its card, click to keep it open. The card shows the bottom of the
  agent's screen, a box to message it, and a blocked agent's prompt as buttons (or `1`–`9`),
  including typed answers. Cards can be dragged and resized.
- Four views: the flat board, a 3D ASCII board, a logic-analyzer timeline (scope), and an
  overview of every connected machine.
- Seven themes (Herdr, Phosphor, Amber, Blueprint, Solder Mask, Synthwave, Datasheet). Your own
  themes live in `~/.config/herdr-app/data/herdr-motherboard/themes/` and survive updates.
- Name agents by space or by terminal address, a rail listing every agent, motion settings, and
  a log of moves.
- Demo mode with seven simulated agents on two machines, which you can also message and answer.
- Opens as a window (`cmd-shift-m`) or a pane (`cmd-alt-m`).
- `test/echo-agent.mjs`, a pretend agent for trying messages and prompts, and
  `scripts/dev.mjs`, a dev loop that hot-reloads the board from a clone.

[Unreleased]: https://github.com/cckelly/herdr-motherboard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/cckelly/herdr-motherboard/releases/tag/v0.1.0

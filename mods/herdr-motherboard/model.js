// Where an agent belongs and why. Pure: no herdr or gpui-kit imports.

import { LABEL } from "./board.js";

/** Commands that mean the network: their chip goes to the NIC instead of the PCH. */
export const NETWORK = new Set(["curl", "wget", "gh", "git", "ssh", "scp", "rsync", "npm", "pnpm", "yarn", "bun", "brew", "pip", "uv", "http", "nc", "aws", "gcloud", "wrangler", "fly"]);
/** Long-lived helpers an agent keeps running; never counted as a command. */
const HELPERS = new Set(["caffeinate", "rg-daemon", "language-server", "gopls", "rust-analyzer", "tsserver", "typescript-language-server", "conhost", "OpenConsole"]);

/** Seconds a file change keeps an agent at the NVMe. */
export const WRITE_WINDOW_MS = 4000;

/**
 * A process list (platform.js `processCommand`) → [{pid, ppid, age (ms), comm (basename)}].
 * Unix ps gives the age as etime, Windows as whole seconds; Windows names lose ".exe".
 */
export function parsePs(stdout) {
  const out = [];
  for (const line of String(stdout ?? "").split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const age = parseEtime(m[3]);
    if (age == null) continue;
    out.push({ pid: +m[1], ppid: +m[2], age, comm: m[4].split(/[\\/]/).pop().replace(/\.exe$/i, "") });
  }
  return out;
}

/** ps etime ([[dd-]hh:]mm:ss) or plain seconds → ms. */
export function parseEtime(s) {
  if (/^\d+$/.test(s)) return +s * 1000;
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(s);
  if (!m) return null;
  const [, d = 0, h = 0, mi, se] = m;
  return (((+d * 24 + +h) * 60 + +mi) * 60 + +se) * 1000;
}

/** Descendants of `root` (not itself). */
export function descendants(procs, root) {
  const kids = new Map();
  for (const p of procs) {
    if (!kids.has(p.ppid)) kids.set(p.ppid, []);
    kids.get(p.ppid).push(p);
  }
  const out = [], stack = [...(kids.get(root) ?? [])];
  while (stack.length) {
    const p = stack.pop();
    out.push(p);
    stack.push(...(kids.get(p.pid) ?? []));
  }
  return out;
}

/**
 * What a working agent is running right now, from its process tree.
 * `workingFor`: ms since it started working (a command older than that predates the turn).
 * `baseline`: pids that were already there while it was idle (MCP servers, helpers).
 * Returns { act: "nic" | "pch", cmd } or null.
 */
export function commandOf(procs, rootPid, workingFor, baseline) {
  if (!rootPid) return null;
  const fresh = descendants(procs, rootPid).filter((p) => !baseline?.has(p.pid) && !HELPERS.has(p.comm) && p.age <= workingFor + 2000);
  if (!fresh.length) return null;
  // The deepest, youngest process says most: "zsh -c" wraps the real command.
  const shells = new Set(["zsh", "bash", "sh", "fish", "dash", "nu", "-zsh", "-bash", "pwsh", "powershell", "cmd"]);
  const real = fresh.filter((p) => !shells.has(p.comm));
  const pickFrom = real.length ? real : fresh;
  const net = pickFrom.find((p) => NETWORK.has(p.comm));
  const youngest = pickFrom.reduce((a, b) => (b.age < a.age ? b : a));
  const p = net ?? youngest;
  return { act: net ? "nic" : "pch", cmd: p.comm };
}

/** The component an agent belongs in. `a` carries status, kind, parent, remote, and observed act. */
export function compFor(a) {
  if (a.parent) return "gpu";
  if (a.status === "blocked") return a.kind === "question" ? "panel" : a.kind === "auth" ? "tpm" : "bios";
  if (a.status === "error") return "fault";
  if (a.status === "done") return "post";
  if (a.status === "idle" || !a.status) return "ram";
  if (a.act === "nic" || a.act === "pch" || a.act === "nvme") return a.act;
  return "cpu0";
}

export function activity(a) {
  if (a.status === "blocked") return a.kind === "question" ? "asked you a question" : a.kind === "auth" ? "needs a login" : "waiting for your permission";
  if (a.status === "error") return "stopped with an error";
  if (a.status === "done") return "finished while you were away";
  if (a.status === "idle" || !a.status) return "idle, waiting for you";
  if (a.act === "pch") return "running " + a.cmd;
  if (a.act === "nic") return "network: " + a.cmd;
  if (a.act === "nvme") return `${a.files} file${a.files === 1 ? "" : "s"} changed`;
  return "thinking";
}

/**
 * Why an agent sits where it does, when that isn't just its status: what the board saw on
 * the machine (a child process, file changes) or that another agent started it. Null when
 * Herdr's status alone put it there, since the card already shows that status.
 */
export function why(a, parentLabel) {
  if (a.parent) return `In PCIe: its terminal was started by ${parentLabel ?? a.parent}.`;
  if (a.status !== "working") return null;
  const where = a.remote ? `${a.machine}'s process list` : "the process list";
  if (a.act === "pch") return `In PCH: ${where} shows a new child process, ${a.cmd}.`;
  if (a.act === "nic") return `In NIC: ${where} shows a network command, ${a.cmd}.`;
  if (a.act === "nvme") return `In NVMe: files are changing under ${a.repo ?? a.cwd}.`;
  return null;
}

/**
 * Who sits where in one component: arrival order; when it's full the last slots
 * become "+N more". Returns { list, shown, more, pillAt, pillSlots }.
 */
export function crowd(list, slots) {
  const cap = slots.length;
  if (list.length <= cap) return { list, shown: list.length, more: 0, pillAt: null, pillSlots: 0 };
  const pillSlots = cap >= 3 ? 2 : 1;
  const shown = Math.max(0, cap - pillSlots);
  return { list, shown, more: list.length - shown, pillAt: slots[shown], pillSlots };
}

/** Herdr address → label and machine: "build-box/t3" → { label: "t3", machine: "build-box" }. */
export function splitAddress(address) {
  const i = String(address).lastIndexOf("/");
  return i < 0 ? { label: address, machine: null } : { label: address.slice(i + 1), machine: address.slice(0, i) };
}

/** Paths that never count as an agent writing. */
export function ignoredPath(p) {
  return /(^|\/)(\.git|node_modules|dist|build|\.next|target|\.turbo|\.cache|coverage|\.wrangler|\.DS_Store)(\/|$)/.test(p);
}

/**
 * The bottom of an agent's screen (`hc read --json` text), worth showing in a card: its last `n`
 * lines that have something on them. Blank lines and rules drawn with box characters are dropped.
 */
export function screenTail(text, n = 10) {
  const rule = /^[\s─━═│┃╭╮╰╯┌┐└┘├┤┬┴┼╌╍┄┅·•\-_=]*$/;
  return String(text ?? "").replace(/\t/g, "  ").split("\n").map((l) => l.trimEnd()).filter((l) => !rule.test(l)).slice(-n);
}

/** What went wrong with an `hc send --json` ({code, stdout, stderr}), or null if it was sent. */
export function sendError(res) {
  let j = null;
  try { j = JSON.parse(res?.stdout ?? ""); } catch (_e) { /* not JSON: fall back to stderr */ }
  if (j?.error) return j.error.message ?? j.error.kind ?? "not sent";
  // "started" says whether a turn began, not whether the text arrived: a typed answer starts none.
  if (res?.code === 0) return null;
  return String(res?.stderr || "not sent").trim().split("\n")[0];
}

/**
 * The menu a blocked agent is showing, read off its screen: the numbered choices at the bottom
 * ("❯ 1. Yes", "  2. No") and the question above them. Coding agents draw their permission and
 * question prompts this way, and pressing a choice's number picks it. Returns null when the bottom
 * of the screen holds no such menu.
 */
export function promptOptions(text) {
  const lines = String(text ?? "").split("\n").map((l) => l.trimEnd());
  const opt = /^\s*(?:[│┃|]\s*)?(?:[❯›>▶➜→]\s*)?(\d{1,2})[.)]\s+(\S.*)$/;
  let run = null, best = null;
  lines.forEach((l, i) => {
    const m = opt.exec(l);
    if (!m) return;
    const n = +m[1];
    if (n === 1) run = { first: i, options: [] };
    else if (!run || n !== run.options.length + 1) { run = null; return; }
    run.options.push({ n, label: m[2].trim(), at: i });
    if (run.options.length >= 2) best = run;
  });
  if (!best) return null;
  // Only a menu still at the bottom: an old numbered list higher up isn't a prompt.
  const after = lines.slice(best.options.at(-1).at + 1).filter((l) => l.trim()).length;
  if (after > 6) return null;
  // The question: the block of text just above the first choice, minus rules and frame bars.
  const rule = /^[\s─━═╌╍┄┅-]*$/;
  const q = [];
  let top = best.first;
  for (let i = best.first - 1; i >= 0 && q.length < 6; i--) {
    const l = lines[i].replace(/^\s*[│┃|]\s?/, "").trim();
    if (!l || rule.test(l)) { if (q.length) break; continue; }
    q.unshift(l);
    top = i;
  }
  // `above`: the screen above the question, which is what the question is about (a command, a diff).
  return { question: q.join(" ") || null, above: lines.slice(0, top).join("\n"), options: best.options.map(({ n, label }) => ({ n, label, typed: /^type something/i.test(label) })) };
}

/** One menu, as text: the same question with the same choices is the same prompt. */
export const promptKey = (p) => (p ? [p.question ?? "", ...p.options.map((o) => `${o.n}. ${o.label}`)].join("\n") : "");

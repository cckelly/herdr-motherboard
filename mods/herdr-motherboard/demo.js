// Demo mode: seven simulated agents on two machines, cycling through every state.
// They are fed to the board in the same shapes Herdr's agents() and terminals() use,
// plus what observation would have seen, so the board's real placement and motion
// rules run on them unchanged. Each one also keeps a made-up screen, drawn like an agent's (with a
// numbered prompt while it's blocked), and takes the card's keys and messages the way a real
// terminal takes `hc keys` and `hc send`, so the card works in demo. Pure: no herdr or gpui-kit imports.

const APPS = {
  claude: { app: "claude-code", program: { key: "claude", name: "Claude Code" } },
  codex: { app: "codex", program: { key: "codex", name: "Codex" } },
  opencode: { app: "opencode", program: { key: "opencode", name: "OpenCode" } },
  pi: { app: "pi", program: { key: "pi", name: "pi" } },
};
const MSGS = [
  "Reading the router before changing it.", "Tests pass; checking lint next.", "I'll rerun the same test and compare.",
  "Found it: the cache key ignores the query string.", "Drafting the PR description.", "Two files left to update.",
  "Comparing the old and new output.", "Splitting this into two commits.", "Tracing where the token is refreshed.",
];
const DONE = ["Done: 3 files changed, tests pass.", "PR #42 opened into develop.", "Guide rewritten; links checked.", "Audit written to findings.md."];
// What a blocked agent asks: a permission prompt for a command, a question with choices, or a login.
const PERMS = [
  { cmd: "git push -u origin HEAD", why: "Push the branch to origin", again: "git push" },
  { cmd: "rm -rf dist", why: "Remove the old build output", again: "rm" },
  { cmd: "psql \"$STAGING_URL\" -f rotate.sql", why: "Run the rotation script against staging", again: "psql" },
];
const QUESTIONS = [
  { q: "Should the limit be per user or per key?", opts: ["Per user (Recommended)", "Per API key"] },
  { q: "Which style should the guide use?", opts: ["Step by step (Recommended)", "Reference"] },
  { q: "Keep the old endpoint working for a release?", opts: ["Yes, with a deprecation warning (Recommended)", "No, remove it now"] },
];
const RULE = "─".repeat(46);
const LOG_LINES = 40;
const CMDS = { pch: ["vitest", "pnpm", "tsc", "eslint", "make", "rg"], nic: ["curl", "gh", "git", "ssh"] };
const SUB_TITLES = ["Explore: find every redirect handler", "Review: check the diff for regressions", "Search: where the session cookie is set"];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);

export class Demo {
  constructor(remote) {
    this.remote = remote;
    this.agents = [];
    this.n = 0;
    const seed = [
      ["t1", null, "claude", "web-app", "Fix the login redirect loop", "~/dev/web-app", "working", "cpu"],
      ["t2", null, "codex", "api", "Rate-limit the upload endpoint", "~/dev/api", "working", "pch"],
      ["t3", null, "opencode", "docs", "Rewrite the deployment guide", "~/dev/docs", "working", "nvme"],
      ["t4", null, "claude", "infra", "Rotate the staging database credentials", "~/dev/infra", "blocked", "cpu"],
      ["t5", null, "pi", "design-system", "Audit color tokens for contrast", "~/dev/design-system", "done", "cpu"],
      ["t1", remote, "claude", "ops", "Verify last night's backups", "~/ops", "working", "nic"],
      ["t2", remote, "codex", "ops", "Upgrade the Postgres container", "~/ops/db", "idle", "cpu"],
    ];
    for (const [label, machine, app, space, title, cwd, status, act] of seed) this.add({ label, machine, app, space, title, cwd, status, act });
    for (const title of SUB_TITLES.slice(0, 2)) this.add({ label: this.nextLabel(), machine: null, app: "claude", space: "web-app", title, cwd: "~/dev/web-app", status: "working", act: "cpu", parent: "t1", next: Date.now() + rand(14000, 22000) });
  }

  nextLabel() { return "t" + (10 + this.n++).toString(36); }

  add(o) {
    const now = Date.now();
    const a = {
      kind: o.status === "blocked" ? "permission" : null, progress: o.label === "t2" && !o.machine ? 35 : null,
      cmd: o.act === "pch" ? "vitest" : o.act === "nic" ? "curl" : null, files: o.act === "nvme" ? 3 : 0,
      turn: Math.floor(rand(2, 40)), since: now - rand(10e3, 400e3), next: now + rand(2500, 7000), parent: null, ...o,
    };
    a.address = a.machine ? `${a.machine}/${a.label}` : a.label;
    if (a.parent && a.machine) a.parent = `${a.machine}/${a.parent}`;
    a.lines = [`> ${a.title}`, ""];
    a.ask = null;
    a.typing = false;
    // The seeded blocked agent (infra) asks to run its rotation script.
    if (a.status === "blocked") this.block(a, a.kind ?? "permission", now, a.next, 2);
    else { a.msg = a.status === "done" ? pick(DONE) : pick(MSGS); this.log(a, `● ${a.msg}`); }
    this.agents.push(a);
    return a;
  }

  /** Adds a line to an agent's screen, keeping the last LOG_LINES. */
  log(a, line) {
    a.lines.push(line);
    if (a.lines.length > LOG_LINES) a.lines.splice(0, a.lines.length - LOG_LINES);
  }

  /** Blocks an agent on a prompt of `kind` (permission, question or auth) until `next`; `which` picks the command. */
  block(a, kind, now, next = now + rand(14000, 22000), which = null) {
    const ask = kind === "permission" ? { kind, ...(PERMS[which] ?? pick(PERMS)) } : kind === "question" ? { kind, ...pick(QUESTIONS) } : { kind };
    const msg = kind === "permission" ? `Wants to run ${ask.cmd}` : kind === "question" ? ask.q : "gh needs you to log in again.";
    this.set(a, "blocked", { kind, msg, next });
    a.ask = ask;
    a.typing = false;
  }

  /** Ends a block: the agent goes back to work with `line` on its screen. */
  unblock(a, line, msg) {
    this.log(a, line);
    this.set(a, "working", { kind: null, msg: msg ?? pick(MSGS), next: Date.now() + rand(2500, 5000) });
    a.ask = null;
    a.typing = false;
    a.turn++;
    a.files = 0;
    this.log(a, `● ${a.msg}`);
  }

  /** Keeps a blocked agent waiting while its card is open, so it doesn't answer itself under you. */
  hold(address, now) {
    const a = this.agents.find((x) => x.address === address);
    if (a?.status === "blocked") a.next = Math.max(a.next, now + 5000);
  }

  /** The agent's screen as text, as `hc read` would give it; null when there's no such agent. */
  read(address) {
    const a = this.agents.find((x) => x.address === address);
    if (!a) return null;
    const out = [...a.lines];
    const k = a.ask;
    if (a.status === "blocked" && k && !a.typing) {
      out.push("", RULE);
      if (k.kind === "permission") {
        out.push(" Bash command", "", `   ${k.cmd}`, `   ${k.why}`, "", " Do you want to proceed?");
        out.push(" ❯ 1. Yes", `   2. Yes, and don't ask again for ${k.again} commands`, "   3. No, and tell me what to do differently (esc)");
      } else if (k.kind === "question") {
        out.push(` ${k.q}`, ...k.opts.map((o, i) => `${i ? "  " : " ❯"} ${i + 1}. ${o}`), `   ${k.opts.length + 1}. Type something.`);
      } else out.push(" gh: authentication required", "", " Run `gh auth login`, then tell me to go on.");
      out.push("", " Esc to cancel");
    }
    if (a.typing) out.push("", "Your answer: ");
    return out.join("\n");
  }

  /**
   * Takes what the card sends, in `hc` argument form: ["keys", "--json", addr, key] or
   * ["send", "--json", ("--force"), "--", addr, text]. Returns why it failed, or null.
   */
  input(args) {
    const keys = args[0] === "keys";
    const i = args.indexOf("--");
    const address = keys ? args[2] : args[i + 1];
    const a = this.agents.find((x) => x.address === address);
    if (!a) return "that demo agent has gone";
    if (keys) {
      const key = args[3];
      if (a.status !== "blocked" || !a.ask || a.typing) return null;
      if (key === "esc") { this.unblock(a, "  ⎿ Cancelled by you", "Okay, leaving that for now."); return null; }
      const n = +key;
      const k = a.ask;
      if (k.kind === "permission" && n >= 1 && n <= 3) {
        if (n === 3) this.unblock(a, `  ⎿ Not run: ${k.cmd}`, "Okay, trying another way.");
        else { this.unblock(a, `● Bash(${k.cmd})`, n === 2 ? `Ran it, and won't ask about ${k.again} again.` : "Ran it; checking the result."); }
      } else if (k.kind === "question" && n >= 1 && n <= k.opts.length) this.unblock(a, `  ⎿ ${k.opts[n - 1]}`, "Got it, going with that.");
      else if (k.kind === "question" && n === k.opts.length + 1) a.typing = true;
      return null;
    }
    const text = String(args[i + 2] ?? "").trim();
    if (!text) return null;
    if (a.status === "blocked") {
      if (!args.includes("--force")) return "it's waiting on a prompt";
      this.unblock(a, `  ⎿ ${text}`, "Got it, going with your answer.");
      return null;
    }
    this.log(a, "");
    this.log(a, `> ${text}`);
    this.set(a, "working", { msg: `Looking at: "${text.length > 40 ? text.slice(0, 39) + "…" : text}"`, next: Date.now() + rand(2500, 4000) });
    a.turn++;
    this.log(a, `● ${a.msg}`);
    return null;
  }

  spaces() {
    const seen = new Map();
    for (const a of this.agents) if (!a.parent && !seen.has(a.space)) seen.set(a.space, { id: "demo:" + a.space, name: a.space, machine: a.machine });
    return [...seen.values()];
  }

  tick(now) {
    for (const a of [...this.agents]) if (now >= a.next) this.step(a, now);
  }

  set(a, status, extra = {}) {
    Object.assign(a, { status, since: Date.now() }, extra);
    if (status !== "working") { a.progress = null; a.act = "cpu"; a.cmd = null; }
  }

  step(a, now) {
    if (a.parent) { this.agents = this.agents.filter((x) => x !== a); return; }
    const subs = this.agents.filter((x) => x.parent === a.address);
    switch (a.status) {
      case "working": {
        const r = Math.random();
        if (r < 0.05) this.block(a, pick(["permission", "permission", "question", "auth"]), now);
        else if (r < 0.11) { this.set(a, "done", { msg: pick(DONE), next: now + rand(8000, 14000) }); this.log(a, `● ${a.msg}`); this.agents = this.agents.filter((x) => x.parent !== a.address); }
        else if (r < 0.125) { this.set(a, "error", { msg: "Lost the connection to the model API.", next: now + rand(7000, 10000) }); this.log(a, `  ⎿ Error: ${a.msg}`); }
        else if (r < 0.19 && a.app === "claude" && !subs.length) {
          for (let i = 0; i < (Math.random() < 0.5 ? 2 : 1); i++) this.add({ label: this.nextLabel(), machine: a.machine, app: a.app, space: a.space, title: pick(SUB_TITLES), cwd: a.cwd, status: "working", act: "cpu", parent: a.label, next: now + rand(9000, 16000) });
          a.next = now + rand(3000, 5000);
        } else {
          const opts = [["cpu", 0.35], ["pch", 0.27], ["nvme", 0.24], ["nic", 0.14]].filter(([k]) => k !== a.act);
          let roll = Math.random() * opts.reduce((s, [, w]) => s + w, 0);
          a.act = opts.find(([, w]) => (roll -= w) <= 0)?.[0] ?? "cpu";
          if (a.act === "pch" || a.act === "nic") { a.cmd = pick(CMDS[a.act]); this.log(a, `● Bash(${a.cmd} …)`); }
          if (a.act === "nvme") { a.files = Math.min(14, a.files + 1 + Math.floor(Math.random() * 3)); this.log(a, `● Update(${a.files} files)`); }
          if (Math.random() < 0.4) { a.msg = pick(MSGS); this.log(a, `● ${a.msg}`); }
          if (a.progress != null) a.progress = Math.min(95, a.progress + 5 + Math.floor(Math.random() * 10));
          a.next = now + rand(2600, 6000);
        }
        break;
      }
      // Nobody answered: it gives up waiting, as a demo should keep moving.
      case "blocked": this.unblock(a, "  ⎿ No answer; carrying on without it"); break;
      case "error": case "done": this.set(a, "idle", { kind: null, next: now + rand(5000, 10000) }); break;
      default:
        if (Math.random() < 0.45) { this.set(a, "working", { msg: pick(MSGS), next: now + rand(2500, 5000) }); a.turn++; a.files = 0; this.log(a, `● ${a.msg}`); }
        else a.next = now + rand(4000, 8000);
    }
  }

  /** The agents as Herdr would describe them, plus what observation would have seen. */
  feed() {
    return this.agents.map((a) => {
      const { app, program } = APPS[a.app];
      return {
        address: a.address,
        info: a.parent ? null : { address: a.address, status: a.status, title: a.title, app, program, space_name: a.space, space: "demo:" + a.space, tab_name: a.space, focused: false },
        term: { address: a.address, parent: a.parent, title: a.title, turn: a.turn, status_ms: a.since, program, foreground: { cwd: a.cwd, pid: null }, report: { app, state: a.status, kind: a.kind, msg: a.msg, progress: a.progress } },
        obs: { act: a.act, cmd: a.cmd, files: a.files },
      };
    });
  }
}

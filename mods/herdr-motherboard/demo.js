// Demo mode: seven simulated agents on two machines, cycling through every state.
// They are fed to the board in the same shapes Herdr's agents() and terminals() use,
// plus what observation would have seen, so the board's real placement and motion
// rules run on them unchanged. Pure: no herdr or gpui-kit imports.

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
const BLOCK = { permission: "Wants approval to push the branch.", question: "Should the limit be per user or per key?", auth: "gh needs you to log in again." };
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
    a.msg = a.status === "done" ? pick(DONE) : a.status === "blocked" ? BLOCK[a.kind] : pick(MSGS);
    this.agents.push(a);
    return a;
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
        if (r < 0.05) { const kind = pick(["permission", "permission", "question", "auth"]); this.set(a, "blocked", { kind, msg: BLOCK[kind], next: now + rand(6000, 11000) }); }
        else if (r < 0.11) { this.set(a, "done", { msg: pick(DONE), next: now + rand(8000, 14000) }); this.agents = this.agents.filter((x) => x.parent !== a.address); }
        else if (r < 0.125) this.set(a, "error", { msg: "Lost the connection to the model API.", next: now + rand(7000, 10000) });
        else if (r < 0.19 && a.app === "claude" && !subs.length) {
          for (let i = 0; i < (Math.random() < 0.5 ? 2 : 1); i++) this.add({ label: this.nextLabel(), machine: a.machine, app: a.app, space: a.space, title: pick(SUB_TITLES), cwd: a.cwd, status: "working", act: "cpu", parent: a.label, next: now + rand(9000, 16000) });
          a.next = now + rand(3000, 5000);
        } else {
          const opts = [["cpu", 0.35], ["pch", 0.27], ["nvme", 0.24], ["nic", 0.14]].filter(([k]) => k !== a.act);
          let roll = Math.random() * opts.reduce((s, [, w]) => s + w, 0);
          a.act = opts.find(([, w]) => (roll -= w) <= 0)?.[0] ?? "cpu";
          if (a.act === "pch" || a.act === "nic") a.cmd = pick(CMDS[a.act]);
          if (a.act === "nvme") a.files = Math.min(14, a.files + 1 + Math.floor(Math.random() * 3));
          if (Math.random() < 0.4) a.msg = pick(MSGS);
          if (a.progress != null) a.progress = Math.min(95, a.progress + 5 + Math.floor(Math.random() * 10));
          a.next = now + rand(2600, 6000);
        }
        break;
      }
      case "blocked": this.set(a, "working", { kind: null, msg: pick(MSGS), next: now + rand(2500, 5000) }); a.turn++; a.files = 0; break;
      case "error": case "done": this.set(a, "idle", { kind: null, next: now + rand(5000, 10000) }); break;
      default:
        if (Math.random() < 0.45) { this.set(a, "working", { msg: pick(MSGS), next: now + rand(2500, 5000) }); a.turn++; a.files = 0; }
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

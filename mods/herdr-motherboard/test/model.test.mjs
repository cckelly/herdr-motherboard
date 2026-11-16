import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePs, parseEtime, commandOf, compFor, crowd, splitAddress, ignoredPath, screenTail, sendError, promptOptions, promptKey } from "../model.js";
import { buildBoard, buildSlots, route, plan, W, H } from "../board.js";

test("parseEtime handles every ps format", () => {
  assert.equal(parseEtime("00:05"), 5000);
  assert.equal(parseEtime("01:02:03"), 3723000);
  assert.equal(parseEtime("2-00:00:01"), 172801000);
  assert.equal(parseEtime("bad"), null);
});

const PS = `  100     1   10:00 /bin/zsh
  200   100   09:00 claude
  300   200   08:59 node
  400   200   00:02 /bin/zsh
  500   400   00:01 pnpm
  600   200   00:01 curl`;

test("commandOf ignores helpers from before the turn and prefers network commands", () => {
  const procs = parsePs(PS);
  assert.deepEqual(commandOf(procs, 200, 30000, new Set([300])), { act: "nic", cmd: "curl" });
  const noCurl = procs.filter((p) => p.comm !== "curl");
  assert.deepEqual(commandOf(noCurl, 200, 30000, new Set([300])), { act: "nic", cmd: "pnpm" });
  assert.equal(commandOf(procs.filter((p) => p.pid <= 300), 200, 30000, new Set([300])), null);
  // An MCP server started 9 minutes ago doesn't count for a turn that began 30 s ago.
  assert.equal(commandOf(procs.filter((p) => p.pid <= 300), 200, 30000, null), null);
});

test("compFor follows Herdr state first, then observation", () => {
  assert.equal(compFor({ status: "blocked", kind: "question" }), "panel");
  assert.equal(compFor({ status: "blocked", kind: "auth" }), "tpm");
  assert.equal(compFor({ status: "blocked" }), "bios");
  assert.equal(compFor({ status: "error" }), "fault");
  assert.equal(compFor({ status: "done", act: "pch" }), "post");
  assert.equal(compFor({ status: "idle" }), "ram");
  assert.equal(compFor({ status: "working", act: "nvme" }), "nvme");
  assert.equal(compFor({ status: "working", act: "cpu", remote: true }), "cpu0");
  assert.equal(compFor({ status: "working", parent: "t3" }), "gpu");
});

test("crowd keeps a pill for the overflow", () => {
  const slots = [1, 2, 3, 4, 5, 6].map((x) => ({ x, y: 0 }));
  assert.equal(crowd([1, 2, 3], slots).more, 0);
  const c = crowd([1, 2, 3, 4, 5, 6, 7, 8, 9], slots);
  assert.equal(c.shown, 4); assert.equal(c.more, 5); assert.equal(c.pillAt, slots[4]);
  const one = crowd([1, 2], [{ x: 0, y: 0 }]);
  assert.equal(one.shown, 0); assert.equal(one.more, 2);
});

test("addresses and ignored paths", () => {
  assert.deepEqual(splitAddress("build-box/t3"), { label: "t3", machine: "build-box" });
  assert.deepEqual(splitAddress("t1y"), { label: "t1y", machine: null });
  assert.ok(ignoredPath("/node_modules/x.js")); assert.ok(ignoredPath("/.git/index"));
  assert.ok(!ignoredPath("/src/app.ts"));
});

test("every route stays on the board and only turns at right angles", () => {
  const { comps } = buildBoard({ machine: "mini" });
  const slots = buildSlots(comps, 6);
  for (const a of Object.keys(comps)) for (const b of Object.keys(comps)) {
    if (a === b) continue;
    const pts = route(comps, a, slots[a][0], b, slots[b][0]);
    for (let i = 1; i < pts.length; i++) assert.ok(pts[i][0] === pts[i - 1][0] || pts[i][1] === pts[i - 1][1], `${a}->${b} diagonal`);
    for (const [x, y] of pts) assert.ok(x > 0 && x < W - 1 && y > 0 && y < H - 1, `${a}->${b} leaves the board`);
    const segs = plan(pts, "full");
    assert.equal(segs.length, pts.length - 1);
  }
});

test("slots sit inside their component and never overlap", () => {
  const { comps } = buildBoard({});
  // [spacing, chip cells]: addresses, short labels, space names.
  for (const [sp, cells] of [[6, 4], [14, 4], [9, 7]]) {
    const slots = buildSlots(comps, sp, cells);
    for (const [k, list] of Object.entries(slots)) {
      const c = comps[k];
      assert.ok(list.length >= 1, `${k} has no slot at spacing ${sp}`);
      for (const s of list) {
        const left = s.x + 0.5 - cells / 2, right = s.x + 0.5 + cells / 2;
        assert.ok(left >= c.x + 0.5 && right <= c.x + c.w - 1 && s.y > c.y && s.y < c.y + c.h - 1, `${k} slot at ${s.x},${s.y} outside (cells ${cells})`);
      }
      for (let i = 1; i < list.length; i++) if (list[i].y === list[i - 1].y) assert.ok(list[i].x - list[i - 1].x >= cells, `${k} chips overlap`);
    }
  }
});

test("demo mode keeps 7 agents moving through every state", async () => {
  const { Demo } = await import("../demo.js");
  const d = new Demo("mac-mini");
  const top = () => d.agents.filter((a) => !a.parent);
  assert.equal(top().length, 7);
  const seen = new Set(top().map((a) => a.status));
  for (const s of ["working", "blocked", "done", "idle"]) assert.ok(seen.has(s), s);
  assert.ok(top().some((a) => a.machine === "mac-mini"));
  let now = Date.now();
  for (let i = 0; i < 400; i++) { now += 1000; d.tick(now); }
  assert.equal(top().length, 7);
  assert.ok(d.feed().every((x) => x.term.report.state));
});

test("a blocked demo agent draws a prompt the card can answer", async () => {
  const { Demo } = await import("../demo.js");
  const d = new Demo("box");
  const a = d.agents.find((x) => x.status === "blocked");
  const p = promptOptions(d.read(a.address));
  assert.equal(p.question, "Do you want to proceed?");
  assert.deepEqual(p.options.map((o) => o.n), [1, 2, 3]);
  assert.match(p.above, /rotate\.sql/);
  assert.equal(d.input(["send", "--json", "--", a.address, "hi"]), "it's waiting on a prompt");
  assert.equal(d.input(["keys", "--json", a.address, "1"]), null);
  assert.equal(a.status, "working");
  assert.equal(promptOptions(d.read(a.address)), null);
});

test("a demo agent takes a typed answer and a message", async () => {
  const { Demo } = await import("../demo.js");
  const d = new Demo("box");
  const a = d.agents.find((x) => x.status === "working" && !x.parent);
  d.block(a, "question", Date.now());
  const p = promptOptions(d.read(a.address));
  const typed = p.options.find((o) => o.typed);
  assert.ok(typed);
  d.input(["keys", "--json", a.address, String(typed.n)]);
  assert.equal(promptOptions(d.read(a.address)), null);
  assert.equal(d.input(["send", "--json", "--force", "--", a.address, "Per team"]), null);
  assert.equal(a.status, "working");
  assert.match(d.read(a.address), /Per team/);
  d.input(["send", "--json", "--", a.address, "Also add a test"]);
  assert.match(d.read(a.address), /> Also add a test/);
  assert.equal(d.input(["send", "--json", "--", "nobody", "x"]), "that demo agent has gone");
});

test("screenTail keeps the last lines with text, without rules", () => {
  const screen = "one\n\n  two  \n────────\n❯ \n\ttab\n╭──╮\n";
  assert.deepEqual(screenTail(screen), ["one", "  two", "❯", "  tab"]);
  assert.deepEqual(screenTail("a\nb\nc", 2), ["b", "c"]);
  assert.deepEqual(screenTail(null), []);
});

test("sendError reads hc send's answer", () => {
  assert.equal(sendError({ code: 0, stdout: '{"started":true,"status":"idle"}' }), null);
  assert.equal(sendError({ code: 0, stdout: '{"started":false,"status":"blocked"}' }), null);
  assert.equal(sendError({ code: 1, stdout: '{"error":{"kind":"blocked","message":"t3 is blocked (question)"}}' }), "t3 is blocked (question)");
  assert.equal(sendError({ code: 2, stdout: "", stderr: "error: no terminal t9\nmore" }), "error: no terminal t9");
});

const QUESTION = `  1. an old list in its answer
  2. that isn't a prompt
⏺ I need a decision.
──────────────────
 ☐ Seed source

│ Where should the seed read the
│ other games from?

❯ 1. Copy into content/ (Recommended)
     Copy each game's files in.
  2. Read the bundle's packages/
     No copies, but only inside a bundle.
  3. Type something.
──────────────────
  4. Chat about this

Enter to select · ↑/↓ to navigate · Esc to cancel`;

const PERMISSION = ` Bash command

   touch x.txt
   Create a file

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and don't ask again for touch commands
   3. No, and tell Claude what to do differently (esc)
`;

test("promptOptions reads a question menu, skipping an older numbered list", () => {
  const p = promptOptions(QUESTION);
  assert.equal(p.question, "Where should the seed read the other games from?");
  assert.deepEqual(p.options.map((o) => [o.n, o.label, o.typed]), [
    [1, "Copy into content/ (Recommended)", false], [2, "Read the bundle's packages/", false], [3, "Type something.", true], [4, "Chat about this", false]]);
});

test("promptOptions reads a permission menu", () => {
  const p = promptOptions(PERMISSION);
  assert.equal(p.question, "Do you want to proceed?");
  assert.deepEqual(p.options.map((o) => o.n), [1, 2, 3]);
  assert.deepEqual(screenTail(p.above), [" Bash command", "   touch x.txt", "   Create a file"]);
});

test("promptOptions ignores a numbered list that isn't at the bottom", () => {
  assert.equal(promptOptions("1. a\n2. b\n" + "text\n".repeat(10)), null);
  assert.equal(promptOptions("just text"), null);
  assert.equal(promptOptions("1. only one"), null);
});

test("promptKey is the same for the same menu, wherever the cursor is", () => {
  const a = promptOptions(PERMISSION);
  const b = promptOptions(PERMISSION.replace(" ❯ 1. Yes", "   1. Yes").replace("   2. Yes,", " ❯ 2. Yes,"));
  assert.equal(promptKey(a), promptKey(b));
  assert.notEqual(promptKey(a), promptKey(promptOptions(QUESTION)));
  assert.equal(promptKey(null), "");
});

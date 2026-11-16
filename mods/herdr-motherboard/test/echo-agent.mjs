#!/usr/bin/env node
// A pretend agent for trying the board's message box without touching a real one. It reports its
// status to Herdr (OSC 7501) like an agent does, and answers each line it gets.
//
//   node ~/.config/herdr-app/mods/herdr-motherboard/test/echo-agent.mjs
//
// Run it in a new Herdr tab. Type or send it anything: it "works" for a few seconds, then echoes
// it back. Send "ask" for a question or "allow" for a permission prompt: both draw a numbered
// menu like Claude Code's, picked by pressing a number (Esc cancels), and block it until then.
// Ctrl-C quits.

const out = (s) => process.stdout.write(s);
const report = (state, extra = {}) => {
  // Fields are key=value, joined by ":". The message is base64, so it can hold anything.
  const fields = { state, app: "echo-agent", ...extra };
  if (fields.msg != null) fields.msg = Buffer.from(String(fields.msg)).toString("base64");
  out(`\x1b]7501;${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(":")}\x07`);
};

const MENUS = {
  ask: { kind: "question", msg: "which color?", question: "Which color should the button be?",
    options: ["Red", "Green (Recommended)", "Blue", "Type something."] },
  allow: { kind: "permission", msg: "rm -rf build", question: "Do you want to proceed?", head: " Bash command\n\n   rm -rf build\n   Remove the build folder\n",
    options: ["Yes", "Yes, and don't ask again for rm commands", "No, and tell me what to do differently (esc)"] },
};

let line = "";
let menu = null; // the open menu, while blocked
let typing = null; // the menu whose "Type something." was picked: the next line answers it
let busy = false;

const prompt = () => out("you> ");
const idle = () => { report("idle", { msg: "waiting for a message" }); prompt(); };

function openMenu(name) {
  menu = MENUS[name];
  report("blocked", { kind: menu.kind, msg: menu.msg });
  out(`\n${"─".repeat(40)}\n`);
  if (menu.head) out(menu.head + "\n");
  out(` ${menu.question}\n`);
  menu.options.forEach((o, i) => out(`${i === 0 ? " ❯" : "  "} ${i + 1}. ${o}\n`));
  out("\nEnter a number · Esc to cancel\n");
}

function pick(i) {
  const m = menu;
  menu = null;
  if (/^type something/i.test(m.options[i])) { typing = m; report("blocked", { kind: m.kind, msg: "typing an answer" }); out("your answer> "); return; }
  out(`echo-agent: you picked ${i + 1}. ${m.options[i]}\n`);
  idle();
}

function work(text) {
  busy = true;
  let n = 0;
  report("working", { msg: `thinking about "${text.slice(0, 40)}"`, progress: 0 });
  const tick = setInterval(() => {
    n += 1;
    report("working", { msg: `thinking about "${text.slice(0, 40)}"`, progress: n * 25 });
    if (n < 4) return;
    clearInterval(tick);
    busy = false;
    out(`echo-agent: you said "${text}"\n`);
    report("done", { msg: "answered" });
    prompt();
  }, 1000);
}

function submit() {
  // A message from another terminal arrives wrapped in <hc from="t3">…</hc>.
  const text = line.replace(/<\/?hc\b[^>]*>/g, "").trim();
  line = "";
  out("\n");
  if (typing) { out(`echo-agent: you answered "${text}"\n`); typing = null; idle(); return; }
  if (!text) { prompt(); return; }
  if (MENUS[text]) { openMenu(text); return; }
  if (busy) { out("echo-agent: still busy, try again in a moment\n"); return; }
  work(text);
}

out("echo-agent: send me a line. \"ask\" asks you a question, \"allow\" wants permission.\n");
idle();

// Raw mode, so a menu takes a single key (as agents' menus do) and a line takes Enter.
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  for (const ch of chunk) {
    if (ch === "\x03") { report("idle"); out("\n"); process.exit(0); }
    if (menu) {
      if (ch === "\x1b") { menu = null; out("echo-agent: cancelled\n"); idle(); }
      else if (/[1-9]/.test(ch) && +ch <= menu.options.length) pick(+ch - 1);
      continue;
    }
    if (ch === "\r" || ch === "\n") submit();
    else if (ch === "\x7f" || ch === "\b") { if (line) { line = line.slice(0, -1); out("\b \b"); } }
    else if (ch >= " ") { line += ch; out(ch); }
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { osName, processCommand, nameCommands, openCommand, normPath, samePath, inside, isWindows } from "../platform.js";
import { parsePs, commandOf } from "../model.js";

test("windows process lines parse: seconds for age, names without .exe", () => {
  const out = "4120 900 75 pwsh.exe\r\n5000 4120 3 curl.exe\r\n6000 4120 12 C:\\Tools\\node.exe\r\n";
  const procs = parsePs(out);
  assert.deepEqual(procs.map((p) => [p.pid, p.ppid, p.age, p.comm]), [[4120, 900, 75000, "pwsh"], [5000, 4120, 3000, "curl"], [6000, 4120, 12000, "node"]]);
  assert.deepEqual(commandOf(procs, 900, 60_000, new Set()), { act: "nic", cmd: "curl" });
});

test("unix process lines parse, including paths with spaces", () => {
  const procs = parsePs("  101     1   01:02:03 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome\n  202   101      00:05 rg\n");
  assert.equal(procs[0].comm, "Google Chrome");
  assert.equal(procs[0].age, 3723_000);
  assert.equal(procs[1].age, 5000);
});

test("this machine's process command really runs and parses", { skip: isWindows(process.platform) }, () => {
  const [cmd, args] = processCommand("unix");
  const procs = parsePs(execFileSync(cmd, args, { encoding: "utf8" }));
  assert.ok(procs.length > 5);
  assert.ok(procs.some((p) => p.pid === process.pid));
});

test("per-OS commands", () => {
  assert.equal(processCommand("windows")[0], "powershell");
  assert.equal(nameCommands("darwin")[0][0], "scutil");
  assert.equal(nameCommands("linux")[0][0], "hostnamectl");
  assert.deepEqual(nameCommands("win32"), [["hostname", []]]);
  assert.deepEqual(openCommand("darwin", "/a/b.json", { text: true }), ["open", ["-t", "/a/b.json"]]);
  assert.deepEqual(openCommand("linux", "/a"), ["xdg-open", ["/a"]]);
  assert.deepEqual(openCommand("win32", "C:/Users/me/themes"), ["explorer", ["C:\\Users\\me\\themes"]]);
});

test("paths compare the same on every OS", () => {
  assert.equal(normPath("C:\\Users\\me\\repo\\"), "C:/Users/me/repo");
  assert.ok(samePath("C:\\Users\\Me", "c:/users/me", "win32"));
  assert.ok(!samePath("/Users/Me", "/users/me", "darwin"));
  assert.equal(inside("C:\\Users\\me\\repo\\src\\a.ts", "C:/Users/me/repo", "win32"), "src/a.ts");
  assert.equal(inside("/home/me/repo/src/a.ts", "/home/me/repo", "linux"), "src/a.ts");
  assert.equal(inside("/home/me/repo2/a.ts", "/home/me/repo", "linux"), null);
  assert.equal(inside("/home/me/repo", "/home/me/repo", "linux"), null);
});

test("the OS name is the same whichever runtime reports it", () => {
  for (const [raw, want] of [["darwin", "darwin"], ["macos", "darwin"], ["MacOS", "darwin"], ["win32", "win32"], ["windows", "win32"], ["linux", "linux"], ["freebsd", "linux"], [undefined, "linux"]]) assert.equal(osName(raw), want, String(raw));
  assert.ok(isWindows("windows") && isWindows("win32") && !isWindows("darwin"));
});

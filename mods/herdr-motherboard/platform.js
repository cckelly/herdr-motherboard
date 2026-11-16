// What differs between macOS, Linux and Windows: how to list processes, name the computer,
// open a file, and compare paths. Pure: no herdr or gpui-kit imports. Every command here may
// be missing on a given machine; callers fall back to Herdr's agent state alone.

/**
 * The OS as one of "darwin", "win32" or "linux". Node says "darwin"/"win32"; Herdr's runtime
 * may say "macos"/"windows" (Rust's names), so accept both. Anything else is treated as Unix.
 */
export function osName(raw) {
  const p = String(raw ?? "").toLowerCase();
  if (p === "darwin" || p.startsWith("mac")) return "darwin";
  if (p.startsWith("win")) return "win32";
  return "linux";
}

export const isWindows = (platform) => osName(platform) === "win32";

/** Process kinds a machine can be asked with, in the order to try them. */
export const PROCESS_KINDS = ["unix", "windows"];

// One line per process: pid, parent pid, age in whole seconds, executable name. Processes
// without a start time (System, Idle) are skipped rather than failing the whole query.
const WIN_PROCESSES = "$n=Get-Date; Get-CimInstance Win32_Process | Where-Object { $_.CreationDate } | "
  + "ForEach-Object { '{0} {1} {2} {3}' -f $_.ProcessId,$_.ParentProcessId,[int]($n-$_.CreationDate).TotalSeconds,$_.Name }";

/** [command, args] that lists every process as "pid ppid age name" lines. */
export function processCommand(kind) {
  if (kind === "windows") return ["powershell", ["-NoProfile", "-NonInteractive", "-Command", WIN_PROCESSES]];
  // -A and -o are POSIX: the same on macOS, Linux (procps) and the BSDs. etime is [[dd-]hh:]mm:ss.
  return ["ps", ["-A", "-o", "pid=,ppid=,etime=,comm="]];
}

/** Commands that may name this computer, best first: [command, args]. */
export function nameCommands(platform) {
  if (platform === "darwin") return [["scutil", ["--get", "ComputerName"]], ["hostname", []]];
  if (isWindows(platform)) return [["hostname", []]];
  return [["hostnamectl", ["--pretty"]], ["hostname", []]];
}

/** [command, args] that opens a file in its default app, or a folder in the file manager. */
export function openCommand(platform, path, { text = false } = {}) {
  if (platform === "darwin") return ["open", text ? ["-t", path] : [path]];
  if (isWindows(platform)) return text ? ["notepad", [path]] : ["explorer", [toNative(path, platform)]];
  return ["xdg-open", [path]];
}

/** Forward slashes everywhere, so Windows paths compare and slice like the others. */
export const normPath = (p) => String(p ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
const toNative = (p, platform) => (isWindows(platform) ? String(p).replace(/\//g, "\\") : p);

/** Same folder? Windows paths ignore case. */
export function samePath(a, b, platform) {
  const x = normPath(a), y = normPath(b);
  return isWindows(platform) ? x.toLowerCase() === y.toLowerCase() : x === y;
}

/** Is `p` inside `root` (not root itself)? Returns the relative path or null. */
export function inside(p, root, platform) {
  const x = normPath(p), r = normPath(root);
  const head = x.slice(0, r.length + 1);
  const match = isWindows(platform) ? head.toLowerCase() === (r + "/").toLowerCase() : head === r + "/";
  return match ? x.slice(r.length + 1) : null;
}

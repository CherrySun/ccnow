// Function: invalide
// Restart all Claude Code sessions and resume them — preserving window layout

const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const name = "invalide";
const description =
  "Restart Claude Code and resume active sessions without losing context";

const SESSIONS_DIR = path.join(os.homedir(), ".claude", "sessions");
const LAYOUT_FILE = path.join(os.homedir(), ".ccnow", "terminal-layout.json");

// ── Colors ────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  white: "\x1b[37m",
};

// ── Session discovery ─────────────────────────────────────────────

function discoverSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return [];

  const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
  const sessions = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8");
      const data = JSON.parse(raw);
      if (!data.pid) continue;

      try {
        process.kill(data.pid, 0);
      } catch {
        continue;
      }

      sessions.push({
        pid: data.pid,
        cwd: data.cwd || null,
        sessionId: data.sessionId || null,
        kind: data.kind || "unknown",
        file,
      });
    } catch {
      // skip malformed
    }
  }

  return sessions;
}

function isCurrentProcess(pid) {
  if (pid === process.pid || pid === process.ppid) return true;
  // Walk up the process tree to catch deeper nesting (e.g. npm → node → ccnow)
  try {
    let cur = process.pid;
    for (let depth = 0; depth < 5; depth++) {
      const ppid = parseInt(
        execFileSync("ps", ["-p", String(cur), "-o", "ppid="], {
          encoding: "utf-8",
          timeout: 1000,
        }).trim(),
        10
      );
      if (ppid === pid) return true;
      if (ppid <= 1) break;
      cur = ppid;
    }
  } catch { /* ps failed — fall through */ }
  return false;
}

function getLiveSessions() {
  return discoverSessions().filter((s) => !isCurrentProcess(s.pid));
}

// ── Terminal window layout (macOS) ────────────────────────────────

function getTTYForPid(pid) {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "tty="], {
      encoding: "utf-8",
      timeout: 3000,
    }).trim();
  } catch {
    return null;
  }
}

function snapshotLayout(sessions) {
  if (process.platform !== "darwin") return null;

  try {
    // Get terminal app
    const termApp = (process.env.TERM_PROGRAM || "").includes("iTerm")
      ? "iTerm2"
      : "Terminal";

    // Build PID → TTY map
    const pidTTY = {};
    for (const s of sessions) {
      const tty = getTTYForPid(s.pid);
      if (tty) pidTTY[s.pid] = tty;
    }

    // Get each window's bounds individually
    const windowData = [];
    const winCount = parseInt(
      execFileSync("osascript", [
        "-e", 'tell application "' + termApp + '" to count windows',
      ], { encoding: "utf-8", timeout: 3000 }).trim(),
      10
    );

    for (let i = 1; i <= winCount; i++) {
      try {
        const bounds = execFileSync("osascript", [
          "-e", 'tell application "' + termApp + '" to get bounds of window ' + i,
        ], { encoding: "utf-8", timeout: 3000 }).trim();

        let ttys = [];
        if (termApp === "Terminal") {
          const ttyRaw = execFileSync("osascript", [
            "-e", 'tell application "Terminal" to get tty of every tab of window ' + i,
          ], { encoding: "utf-8", timeout: 3000 }).trim();
          ttys = ttyRaw.split(", ").map((t) => t.trim());
        }

        windowData.push({
          index: i,
          bounds: bounds.split(", ").map(Number),
          ttys,
        });
      } catch {
        // skip inaccessible windows
      }
    }

    // Map sessions to windows
    const layout = {
      termApp,
      timestamp: Date.now(),
      windows: windowData,
      pidTTY,
      sessions: sessions.map((s) => ({
        pid: s.pid,
        cwd: s.cwd,
        sessionId: s.sessionId,
        tty: pidTTY[s.pid] || null,
      })),
    };

    fs.mkdirSync(path.dirname(LAYOUT_FILE), { recursive: true });
    fs.writeFileSync(LAYOUT_FILE, JSON.stringify(layout, null, 2));
    return layout;
  } catch (err) {
    return null;
  }
}

// Normalize TTY name: "/dev/ttys005" → "ttys005", "ttys005" → "ttys005"
function normalizeTTY(tty) {
  if (!tty) return null;
  return tty.replace(/^\/dev\//, "");
}

function restoreWindowBounds(layout, sessionTTY) {
  if (!layout || process.platform !== "darwin") return false;

  // Find which window this session's TTY belonged to
  let targetBounds = null;
  const normalizedTTY = normalizeTTY(sessionTTY);
  if (normalizedTTY) {
    for (const win of layout.windows) {
      const winTTYs = win.ttys.map(normalizeTTY);
      if (winTTYs.includes(normalizedTTY)) {
        targetBounds = win.bounds;
        break;
      }
    }
  }

  if (!targetBounds) return false;

  const termApp = layout.termApp || "Terminal";

  try {
    // The new window is the frontmost after `do script` opened it
    const boundsStr = targetBounds.join(", ");
    execFileSync("osascript", [
      "-e", 'tell application "' + termApp + '" to set bounds of front window to {' + boundsStr + "}",
    ], { stdio: "ignore", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

// ── Status for list view ──────────────────────────────────────────

function getStatus() {
  const live = getLiveSessions();

  if (live.length === 0) {
    return { configured: false, summary: "No active sessions" };
  }

  const dirs = live.map((s) => (s.cwd ? path.basename(s.cwd) : "?"));
  const unique = [...new Set(dirs)];

  return {
    configured: true,
    summary: live.length + " active session(s): " + unique.join(", "),
  };
}

// ── Detail view ───────────────────────────────────────────────────

function renderDetail() {
  const live = getLiveSessions();

  const lines = [];
  lines.push("");
  lines.push(
    "  " + c.bold + c.cyan + "invalide" + c.reset + " " + c.dim +
    "— restart Claude Code and resume all sessions" + c.reset
  );
  lines.push("");
  lines.push(
    "  " + c.white +
    "Kills all running Claude Code sessions, then relaunches each" + c.reset
  );
  lines.push(
    "  " + c.white +
    "one in its original directory with --resume, restoring window positions." + c.reset
  );
  lines.push("");

  if (live.length === 0) {
    lines.push("  " + c.yellow + "No active sessions found." + c.reset);
  } else {
    lines.push(
      "  " + c.white + "Active sessions (" + c.bold + live.length +
      c.reset + c.white + "):" + c.reset
    );
    lines.push("");
    for (const s of live) {
      const dirName = s.cwd ? path.basename(s.cwd) : "?";
      const dirFull = s.cwd || "unknown";
      const kindTag =
        s.kind === "interactive"
          ? ""
          : " " + c.dim + "[" + s.kind + "]" + c.reset;
      lines.push(
        "    " + c.cyan + "❯" + c.reset + " " + c.bold + c.white +
        dirName + c.reset + kindTag
      );
      lines.push("      " + c.dim + dirFull + c.reset);
      lines.push(
        "      " + c.dim + "PID " + s.pid + "  session " +
        (s.sessionId ? s.sessionId.slice(0, 8) + "…" : "?") + c.reset
      );
    }
  }

  lines.push("");
  if (live.length > 0) {
    lines.push(
      "  " + c.dim +
      "Press Enter to restart all, or Esc/q to go back" + c.reset
    );
    lines.push(
      "  " + c.dim +
      "Window positions will be saved and restored (Terminal.app)" + c.reset
    );
  } else {
    lines.push("  " + c.dim + "Press Esc/q to go back" + c.reset);
  }
  lines.push("");

  return lines.join("\n");
}

// ── Main run ──────────────────────────────────────────────────────

async function run() {
  console.log("");
  console.log(
    "  " + c.bold + c.cyan + "invalide" + c.reset + " " + c.dim +
    "— restarting..." + c.reset
  );
  console.log("");

  const toRestart = getLiveSessions();

  if (toRestart.length === 0) {
    console.log(
      "  " + c.yellow + "No active Claude Code sessions found." + c.reset
    );
    console.log("  " + c.dim + "Nothing to do." + c.reset);
    console.log("");
    return;
  }

  // Show what we're about to do
  console.log(
    "  " + c.white + "Restarting " + c.bold + toRestart.length + c.reset +
    c.white + " session(s):" + c.reset
  );
  console.log("");
  for (const s of toRestart) {
    console.log(
      "    " + c.cyan + "PID " + s.pid + c.reset + "  " + c.dim +
      (s.cwd || "?") + c.reset
    );
  }
  console.log("");

  // 1. Snapshot window layout BEFORE killing
  console.log(
    "  " + c.yellow + "⏳ Saving window layout..." + c.reset
  );
  const layout = snapshotLayout(toRestart);
  if (layout) {
    console.log(
      "    " + c.green + "✔ Saved " + layout.windows.length +
      " window(s) layout" + c.reset
    );
  } else {
    console.log(
      "    " + c.dim + "— Could not save layout (skipped — won't affect session resume)" + c.reset
    );
    if (process.platform === "darwin") {
      console.log(
        "    " + c.dim +
        "  Tip: grant Automation permission in System Settings → Privacy & Security" +
        c.reset
      );
    }
  }
  console.log("");

  // 2. Record directories + session info + tty mapping before killing
  const sessionsInfo = toRestart.map((s) => ({
    cwd: s.cwd,
    pid: s.pid,
    sessionId: s.sessionId,
    tty: layout ? (layout.pidTTY[s.pid] || null) : null,
  }));
  // Deduplicate by sessionId (not cwd — same dir may have multiple sessions)
  const seen = new Set();
  const uniqueSessions = sessionsInfo.filter((s) => {
    const key = s.sessionId || s.cwd;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 3. Kill all sessions
  console.log(
    "  " + c.yellow + "⏳ Killing " + toRestart.length + " session(s)..." + c.reset
  );

  for (const s of toRestart) {
    try {
      process.kill(s.pid, "SIGTERM");
      console.log("    " + c.dim + "SIGTERM → PID " + s.pid + c.reset);
    } catch {
      console.log(
        "    " + c.dim + "PID " + s.pid + " already gone" + c.reset
      );
    }
  }

  await new Promise((r) => setTimeout(r, 1500));

  // Force-kill survivors
  for (const s of toRestart) {
    try {
      process.kill(s.pid, 0);
      process.kill(s.pid, "SIGKILL");
      console.log("    " + c.red + "SIGKILL → PID " + s.pid + c.reset);
    } catch {
      // already dead
    }
  }

  await new Promise((r) => setTimeout(r, 500));

  console.log("  " + c.green + "✔ All sessions terminated." + c.reset);
  console.log("");

  // 3.5. Close old Terminal windows that belonged to killed sessions
  if (process.platform === "darwin" && layout) {
    console.log(
      "  " + c.yellow + "⏳ Closing old terminal windows..." + c.reset
    );

    const termApp = layout.termApp || "Terminal";
    // Collect normalized TTYs for all sessions we killed
    const sessionTTYs = new Set();
    for (const info of sessionsInfo) {
      const nt = normalizeTTY(info.tty);
      if (nt) sessionTTYs.add(nt);
    }
    // Get current process TTY so we don't close our own window
    const currentTTY = normalizeTTY(getTTYForPid(process.pid));

    if (sessionTTYs.size > 0) {
      try {
        // Close windows from last to first to avoid index shifting
        const winCount = parseInt(
          execFileSync("osascript", [
            "-e", 'tell application "' + termApp + '" to count windows',
          ], { encoding: "utf-8", timeout: 3000 }).trim(),
          10
        );

        let closed = 0;
        for (let i = winCount; i >= 1; i--) {
          try {
            const ttyRaw = execFileSync("osascript", [
              "-e", 'tell application "' + termApp + '" to get tty of every tab of window ' + i,
            ], { encoding: "utf-8", timeout: 3000 }).trim();
            const winTTYs = ttyRaw.split(", ").map((t) => normalizeTTY(t.trim()));

            // Close this window if any of its tabs match a killed session's TTY
            // but skip the window running ccnow itself
            const hasMatch = winTTYs.some((t) => t && sessionTTYs.has(t));
            const isSelf = currentTTY && winTTYs.includes(currentTTY);
            if (hasMatch && !isSelf) {
              // Exit each tab's shell first so Terminal won't prompt about running processes
              for (let t = winTTYs.length; t >= 1; t--) {
                try {
                  execFileSync("osascript", [
                    "-e", 'tell application "' + termApp + '"',
                    "-e", '  do script "exit" in tab ' + t + ' of window ' + i,
                    "-e", "end tell",
                  ], { stdio: "ignore", timeout: 3000 });
                } catch { /* tab may already be closed */ }
              }
              // Brief pause for shells to exit
              await new Promise((r) => setTimeout(r, 300));
              try {
                execFileSync("osascript", [
                  "-e", 'tell application "' + termApp + '" to close window ' + i,
                ], { stdio: "ignore", timeout: 3000 });
              } catch { /* window may have auto-closed after shell exit */ }
              closed++;
            }
          } catch {
            // skip inaccessible windows
          }
        }

        if (closed > 0) {
          console.log(
            "    " + c.green + "✔ Closed " + closed + " old window(s)" + c.reset
          );
        } else {
          console.log(
            "    " + c.dim + "— No matching windows found to close" + c.reset
          );
        }
      } catch (err) {
        console.log(
          "    " + c.dim + "— Could not close old windows: " + err.message + c.reset
        );
      }
    }
    console.log("");
  }

  // 4. Relaunch in each directory, restore window position
  console.log(
    "  " + c.yellow + "⏳ Relaunching " + uniqueSessions.length +
    " session(s)..." + c.reset
  );

  for (const info of uniqueSessions) {
    const dir = info.cwd;
    if (!fs.existsSync(dir)) {
      console.log(
        "    " + c.red + "✗ " + dir + " — no longer exists, skipping" + c.reset
      );
      continue;
    }

    try {
      if (process.platform === "darwin") {
        const termApp = (layout && layout.termApp)
          ? layout.termApp
          : (process.env.TERM_PROGRAM || "").includes("iTerm")
            ? "iTerm2"
            : "Terminal";
        const escapedDir = dir.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const resumeArg = info.sessionId
          ? " --resume " + info.sessionId
          : " --resume";
        const cmd = "cd " + escapedDir + " && claude" + resumeArg;
        execFileSync("osascript", [
          "-e", 'tell application "' + termApp + '"',
          "-e", "  activate",
          "-e", '  do script "' + cmd.replace(/"/g, '\\"') + '"',
          "-e", "end tell",
        ], { stdio: "ignore", timeout: 5000 });

        console.log("    " + c.green + "✔ " + dir + c.reset);

        // Best-effort: try to restore window position
        // Wait for window to fully appear before setting bounds
        await new Promise((r) => setTimeout(r, 800));
        try {
          const restored = restoreWindowBounds(layout, info.tty);
          if (restored) {
            console.log(
              "      " + c.dim + "↳ window position restored" + c.reset
            );
          }
        } catch {
          // Window restore is optional — resume still succeeded
        }
      } else {
        const resumeArgs = info.sessionId
          ? ["--resume", info.sessionId]
          : ["--resume"];
        const child = spawn("claude", resumeArgs, {
          cwd: dir,
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        console.log("    " + c.green + "✔ " + dir + c.reset);
      }
    } catch (err) {
      console.log(
        "    " + c.red + "✗ " + dir + " — " + err.message + c.reset
      );
      // Check if it's a permission issue with osascript
      if (err.message && err.message.includes("not allowed")) {
        console.log(
          "      " + c.yellow +
          "💡 Grant Accessibility permission: System Settings → Privacy & Security → Automation" +
          c.reset
        );
      }
    }
  }

  console.log("");
  console.log(
    "  " + c.green + c.bold + "Done!" + c.reset + " " + c.white +
    "All sessions relaunched." + c.reset
  );
  console.log("");
}

module.exports = { name, description, getStatus, renderDetail, run };

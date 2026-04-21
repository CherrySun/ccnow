// Function: statusline
// One-click status line presets for Claude Code

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

const name = "statusline";
const description = "One-click status line presets for Claude Code";

// ── Paths ─────────────────────────────────────────────────────────
const SETTINGS_FILE = path.join(os.homedir(), ".claude", "settings.json");
const SCRIPTS_DIR = path.join(os.homedir(), ".ccnow", "statusline");

// ── Colors (for terminal preview in ccnow UI) ────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  white: "\x1b[37m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

// ── Bash script builder helpers ───────────────────────────────────
// We use ESC variable inside bash scripts to avoid JS template string issues

const BASH_HEADER = [
  "#!/bin/bash",
  "input=$(cat)",
  "",
  "# ANSI escape",
  "ESC='\\x1b'",
  "",
].join("\n");

const BASH_COMMON = [
  'MODEL=$(echo "$input" | jq -r \'.model.display_name // "?"\')',
  'PCT=$(echo "$input" | jq -r \'.context_window.used_percentage // 0\' | cut -d. -f1)',
  "PCT=${PCT:-0}",
  'COST_RAW=$(echo "$input" | jq -r \'.cost.total_cost_usd // 0\')',
  'COST=$(printf "\\$%.2f" "$COST_RAW")',
  'DUR_MS=$(echo "$input" | jq -r \'.cost.total_duration_ms // 0\' | cut -d. -f1)',
  'ADDED=$(echo "$input" | jq -r \'.cost.total_lines_added // 0\')',
  'REMOVED=$(echo "$input" | jq -r \'.cost.total_lines_removed // 0\')',
  'DIR=$(echo "$input" | jq -r \'.workspace.current_dir // "?"\' | xargs basename)',
  "",
  "MINS=$((DUR_MS / 60000))",
  "SECS=$(( (DUR_MS % 60000) / 1000 ))",
  'if [ "$MINS" -gt 0 ]; then TIME="${MINS}m${SECS}s"; else TIME="${SECS}s"; fi',
  "",
].join("\n");

// ── Presets ───────────────────────────────────────────────────────

const PRESETS = [
  // ─── 1. Mission Control ──────────────────────────────────────
  {
    name: "mission-control",
    label: "🚀 Mission Control",
    preview:
      c.dim + "[Opus] " + c.green + "▓▓▓▓" + c.yellow + "▓" + c.dim + "░░░░░ 48%  $0.37  ⏱3m12s  +89/-12  📂 my-project" + c.reset,
    description:
      "Full dashboard — model, context bar, cost, time, lines changed, directory",
    script:
      BASH_HEADER +
      BASH_COMMON +
      [
        "# Context bar (10 chars)",
        "FILLED=$((PCT / 10))",
        "EMPTY=$((10 - FILLED))",
        "",
        'BAR=""',
        "for i in $(seq 1 $FILLED); do",
        '  if [ "$PCT" -ge 90 ]; then BAR+="${ESC}[31m▓"',
        '  elif [ "$PCT" -ge 70 ]; then BAR+="${ESC}[33m▓"',
        '  else BAR+="${ESC}[32m▓"',
        "  fi",
        "done",
        'for i in $(seq 1 $EMPTY); do BAR+="${ESC}[2m░"; done',
        "",
        'echo -e "${ESC}[2m[${ESC}[0m$MODEL${ESC}[2m]${ESC}[0m $BAR${ESC}[0m ${ESC}[2m${PCT}%${ESC}[0m  ${ESC}[33m$COST${ESC}[0m  ${ESC}[2m⏱$TIME${ESC}[0m  ${ESC}[32m+$ADDED${ESC}[2m/${ESC}[31m-$REMOVED${ESC}[0m  ${ESC}[36m📂 $DIR${ESC}[0m"',
      ].join("\n") +
      "\n",
  },

  // ─── 2. Minimal Zen ─────────────────────────────────────────
  {
    name: "minimal-zen",
    label: "🧘 Minimal Zen",
    preview: c.dim + "Opus · 48% · $0.37" + c.reset,
    description: "Clean and quiet — just model, context %, and cost. No distractions",
    script:
      BASH_HEADER +
      [
        'MODEL=$(echo "$input" | jq -r \'.model.display_name // "?"\')',
        'PCT=$(echo "$input" | jq -r \'.context_window.used_percentage // 0\' | cut -d. -f1)',
        "PCT=${PCT:-0}",
        'COST=$(printf "\\$%.2f" "$(echo "$input" | jq -r \'.cost.total_cost_usd // 0\')")',
        "",
        '# Color percentage by usage',
        'if [ "$PCT" -ge 90 ]; then PC="${ESC}[31m"',
        'elif [ "$PCT" -ge 70 ]; then PC="${ESC}[33m"',
        'else PC="${ESC}[2m"',
        "fi",
        "",
        'echo -e "${ESC}[2m$MODEL · ${PC}${PCT}%${ESC}[0m${ESC}[2m · $COST${ESC}[0m"',
      ].join("\n") +
      "\n",
  },

  // ─── 3. Quota Watcher ───────────────────────────────────────
  {
    name: "quota-watcher",
    label: "📊 Quota Watcher",
    preview:
      c.dim + "Opus  ctx " + c.green + "48%" + c.dim + "  5h-quota " + c.yellow + "67%" + c.dim + "(resets 2h14m)  7d-quota " + c.green + "23%" + c.dim + "  $0.37" + c.reset,
    description:
      "Focus on rate limits & quotas — ideal for Claude.ai Pro/Max subscribers",
    script:
      BASH_HEADER +
      [
        'MODEL=$(echo "$input" | jq -r \'.model.display_name // "?"\')',
        'PCT=$(echo "$input" | jq -r \'.context_window.used_percentage // 0\' | cut -d. -f1)',
        "PCT=${PCT:-0}",
        'COST=$(printf "\\$%.2f" "$(echo "$input" | jq -r \'.cost.total_cost_usd // 0\')")',
        "",
        "# Context color",
        'if [ "$PCT" -ge 90 ]; then CC="${ESC}[31m"',
        'elif [ "$PCT" -ge 70 ]; then CC="${ESC}[33m"',
        'else CC="${ESC}[32m"',
        "fi",
        "",
        'OUT="${ESC}[2m$MODEL${ESC}[0m  ${ESC}[2mctx ${CC}${PCT}%${ESC}[0m"',
        "",
        "# Rate limits (Claude.ai subscribers only)",
        "FIVE_PCT=$(echo \"$input\" | jq -r '.rate_limits.five_hour.used_percentage // empty' 2>/dev/null)",
        "SEVEN_PCT=$(echo \"$input\" | jq -r '.rate_limits.seven_day.used_percentage // empty' 2>/dev/null)",
        "",
        'if [ -n "$FIVE_PCT" ]; then',
        '  FIVE_INT=$(echo "$FIVE_PCT" | cut -d. -f1)',
        "  RESETS_AT=$(echo \"$input\" | jq -r '.rate_limits.five_hour.resets_at // 0')",
        "  NOW=$(date +%s)",
        "  DIFF=$(( RESETS_AT - NOW ))",
        '  if [ "$DIFF" -gt 0 ]; then',
        "    R_H=$((DIFF / 3600))",
        "    R_M=$(( (DIFF % 3600) / 60 ))",
        '    if [ "$R_H" -gt 0 ]; then RESET_STR="${R_H}h${R_M}m"; else RESET_STR="${R_M}m"; fi',
        "  else",
        '    RESET_STR="now"',
        "  fi",
        "",
        '  if [ "$FIVE_INT" -ge 90 ]; then FC="${ESC}[31m"',
        '  elif [ "$FIVE_INT" -ge 70 ]; then FC="${ESC}[33m"',
        '  else FC="${ESC}[32m"',
        "  fi",
        "",
        '  OUT+="  ${ESC}[2m5h ${FC}${FIVE_INT}%${ESC}[2m(${RESET_STR})${ESC}[0m"',
        "fi",
        "",
        'if [ -n "$SEVEN_PCT" ]; then',
        '  SEVEN_INT=$(echo "$SEVEN_PCT" | cut -d. -f1)',
        '  if [ "$SEVEN_INT" -ge 90 ]; then SC="${ESC}[31m"',
        '  elif [ "$SEVEN_INT" -ge 70 ]; then SC="${ESC}[33m"',
        '  else SC="${ESC}[32m"',
        "  fi",
        '  OUT+="  ${ESC}[2m7d ${SC}${SEVEN_INT}%${ESC}[0m"',
        "fi",
        "",
        'OUT+="  ${ESC}[33m$COST${ESC}[0m"',
        "",
        'echo -e "$OUT"',
      ].join("\n") +
      "\n",
  },

  // ─── 4. Dev Focus ───────────────────────────────────────────
  {
    name: "dev-focus",
    label: "🛠️  Dev Focus",
    preview:
      c.cyan + "my-project" + c.dim + "  main  " + c.green + "▸▸▸▸" + c.dim + "▸▸▸▸▸▸" + c.white + "  +89 −12  " + c.dim + "⏱3m12s" + c.reset,
    description:
      "Developer-oriented — project, git branch, progress, lines changed, time",
    script:
      BASH_HEADER +
      BASH_COMMON +
      [
        "# Git branch",
        'BRANCH=$(cd "$(echo "$input" | jq -r \'.workspace.current_dir // "."\')" 2>/dev/null && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "—")',
        "",
        "# Progress arrows (10 chars)",
        "FILLED=$((PCT / 10))",
        "EMPTY=$((10 - FILLED))",
        'BAR=""',
        "for i in $(seq 1 $FILLED); do",
        '  if [ "$PCT" -ge 90 ]; then BAR+="${ESC}[31m▸"',
        '  elif [ "$PCT" -ge 70 ]; then BAR+="${ESC}[33m▸"',
        '  else BAR+="${ESC}[32m▸"',
        "  fi",
        "done",
        'for i in $(seq 1 $EMPTY); do BAR+="${ESC}[2m▸"; done',
        "",
        'echo -e "${ESC}[36m$DIR${ESC}[0m  ${ESC}[2m$BRANCH${ESC}[0m  $BAR${ESC}[0m  ${ESC}[32m+$ADDED ${ESC}[31m−$REMOVED${ESC}[0m  ${ESC}[2m⏱$TIME${ESC}[0m"',
      ].join("\n") +
      "\n",
  },

  // ─── 5. Powerline ──────────────────────────────────────────
  {
    name: "powerline",
    label: "⚡ Powerline",
    preview:
      c.bold + c.white + " Opus " + c.reset + c.dim + " " + c.green + "48% " + c.reset + c.dim + " $0.37 " + c.reset + c.dim + " 3m12s " + c.reset + c.dim + " my-project " + c.reset,
    description:
      "Bold segmented bar — inspired by Powerline/Starship terminal themes",
    script:
      BASH_HEADER +
      BASH_COMMON +
      [
        "# Context color",
        'if [ "$PCT" -ge 90 ]; then PC="${ESC}[31m"',
        'elif [ "$PCT" -ge 70 ]; then PC="${ESC}[33m"',
        'else PC="${ESC}[32m"',
        "fi",
        "",
        'SEP="${ESC}[2m│${ESC}[0m"',
        "",
        'echo -e "${ESC}[1m $MODEL ${ESC}[0m$SEP ${PC}${PCT}%${ESC}[0m $SEP ${ESC}[33m$COST${ESC}[0m $SEP ${ESC}[2m$TIME${ESC}[0m $SEP ${ESC}[32m+$ADDED${ESC}[31m-$REMOVED${ESC}[0m $SEP ${ESC}[36m$DIR${ESC}[0m"',
      ].join("\n") +
      "\n",
  },
];

// ── Detect current config ─────────────────────────────────────────

function getCurrentPreset() {
  try {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    const sl = settings.statusLine;
    if (!sl || !sl.command) return null;
    // Check if it's one of our presets
    for (const p of PRESETS) {
      const scriptPath = path.join(SCRIPTS_DIR, p.name + ".sh");
      if (sl.command === scriptPath) return p.name;
    }
    return "__custom__"; // has a statusline but not one of ours
  } catch {
    return null;
  }
}

// ── Status ────────────────────────────────────────────────────────

function getStatus() {
  const current = getCurrentPreset();
  if (!current) {
    return { configured: false, summary: description };
  }
  if (current === "__custom__") {
    return { configured: true, summary: "Custom statusline active" };
  }
  const preset = PRESETS.find((p) => p.name === current);
  return {
    configured: true,
    summary: "Active: " + (preset ? preset.label : current),
  };
}

// ── Helpers ───────────────────────────────────────────────────────

function waitForKey() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.once("keypress", (_str, key) => {
      var seq = "";
      if (key && key.sequence) seq = key.sequence;
      else if (_str) seq = _str;
      resolve(seq);
    });
  });
}

function installPreset(preset) {
  // 1. Write script file
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  var scriptPath = path.join(SCRIPTS_DIR, preset.name + ".sh");
  fs.writeFileSync(scriptPath, preset.script, { mode: 0o755 });

  // 2. Update settings.json
  var settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
  } catch (e) {
    // will create new
  }

  settings.statusLine = {
    type: "command",
    command: scriptPath,
  };

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
  return scriptPath;
}

function removeStatusLine() {
  try {
    var settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    delete settings.statusLine;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
    return true;
  } catch (e) {
    return false;
  }
}

// ── Interactive preset picker ─────────────────────────────────────

async function run() {
  var current = getCurrentPreset();

  // Build menu items: presets + disable option
  var items = PRESETS.slice();
  if (current) {
    items.push({
      name: "__disable__",
      label: "🚫 Disable Status Line",
      preview: c.dim + "Remove statusline configuration" + c.reset,
      description: "Turn off the status line entirely",
    });
  }

  var selected = 0;
  // Pre-select current preset if any
  if (current && current !== "__custom__") {
    var idx = items.findIndex(function (p) { return p.name === current; });
    if (idx >= 0) selected = idx;
  }

  // Track the line index where each item's pointer (❯) row lives
  var scrollOffset = 0;

  function render() {
    process.stdout.write("\x1b[2J\x1b[H");

    var lines = [];
    var selectedLineIndex = -1;

    lines.push("");
    lines.push(
      "  " + c.bold + c.cyan + "⚡ ccnow" + c.reset + " " + c.dim + "›" + c.reset + " " + c.bold + "statusline" + c.reset + " " + c.dim + "— pick a preset" + c.reset
    );
    lines.push("");
    lines.push(
      "  " + c.dim + "Use ↑↓ to browse, Enter to apply, q to cancel" + c.reset
    );
    lines.push("");

    items.forEach(function (item, i) {
      var sel = i === selected;
      var pointer = sel ? c.cyan + "❯" + c.reset : " ";
      var isCurrent = item.name === current;
      var tag = isCurrent ? " " + c.green + "(active)" + c.reset : "";
      var nameStr = sel
        ? c.bold + c.white + item.label + c.reset
        : c.dim + item.label + c.reset;

      if (sel) selectedLineIndex = lines.length;

      lines.push("  " + pointer + " " + nameStr + tag);
      lines.push("    " + c.dim + item.description + c.reset);
      if (item.preview) {
        lines.push("    " + c.dim + "Preview:" + c.reset + " " + item.preview);
      }
      lines.push("");
    });

    // Scrollable viewport
    var maxH = (process.stdout.rows || 24);
    var viewH = maxH - 1; // reserve 1 line for scroll indicator
    var totalLines = lines.length;

    if (totalLines <= viewH) {
      // Everything fits — no scrolling needed
      scrollOffset = 0;
      process.stdout.write(lines.join("\n") + "\n");
      return;
    }

    // Ensure selected item is visible: keep 2 lines margin
    var maxScroll = Math.max(0, totalLines - viewH);
    if (selectedLineIndex < scrollOffset + 2) {
      scrollOffset = Math.max(0, selectedLineIndex - 2);
    } else if (selectedLineIndex > scrollOffset + viewH - 4) {
      scrollOffset = Math.min(maxScroll, selectedLineIndex - viewH + 4);
    }
    if (scrollOffset > maxScroll) scrollOffset = maxScroll;
    if (scrollOffset < 0) scrollOffset = 0;

    var visible = lines.slice(scrollOffset, scrollOffset + viewH);
    process.stdout.write(visible.join("\n") + "\n");

    // Scroll indicator
    var pct = maxScroll > 0
      ? Math.round((scrollOffset / maxScroll) * 100)
      : 100;
    var indicator = scrollOffset > 0 && scrollOffset < maxScroll
      ? "↑↓ " + pct + "%"
      : scrollOffset === 0
        ? "↓ more"
        : "↑ top";
    process.stdout.write(
      "  " + c.dim + "── scroll: " + indicator + " ──" + c.reset
    );
  }

  render();

  while (true) {
    var key = await waitForKey();

    if (key === "\x1b[A") {
      selected = (selected - 1 + items.length) % items.length;
      render();
    } else if (key === "\x1b[B") {
      selected = (selected + 1) % items.length;
      render();
    } else if (key === "\r") {
      var chosen = items[selected];

      process.stdout.write("\x1b[2J\x1b[H");
      console.log("");

      if (chosen.name === "__disable__") {
        removeStatusLine();
        console.log(
          "  " + c.green + c.bold + "✔ Status line disabled." + c.reset
        );
        console.log(
          "  " + c.dim + "Restart Claude Code or open a new session to apply." + c.reset
        );
      } else {
        var scriptPath = installPreset(chosen);
        console.log(
          "  " + c.green + c.bold + "✔ Applied: " + chosen.label + c.reset
        );
        console.log("");
        console.log("  " + c.dim + "Script:   " + scriptPath + c.reset);
        console.log("  " + c.dim + "Settings: " + SETTINGS_FILE + c.reset);
        console.log("");
        console.log(
          "  " + c.white + "Restart Claude Code or open a new session to see it." + c.reset
        );
      }
      console.log("");
      return;
    } else if (key === "q" || key === "\x1b" || key === "\x03") {
      return;
    }
  }
}

module.exports = { name, description, getStatus, run };

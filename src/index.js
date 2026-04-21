#!/usr/bin/env node

const readline = require("readline");
const functions = require("./functions");

// ── Colors (no dependencies) ──────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  white: "\x1b[37m",
};

// ── State ─────────────────────────────────────────────────────────
let selectedIndex = 0;
let scrollOffset = 0;
let mode = "list"; // "list" | "detail" | "running" | "waitback"

// ── Helpers ───────────────────────────────────────────────────────
function termHeight() {
  return process.stdout.rows || 24;
}

function clearScreen() {
  process.stdout.write("\x1b[2J\x1b[H");
}

function hideCursor() {
  process.stdout.write("\x1b[?25l");
}

function showCursor() {
  process.stdout.write("\x1b[?25h");
}

// Strip ANSI escape codes to get visible character count
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

// ── Build full page content (list + inline preview) ──────────────

// buildListPage returns { lines, previewStart }
// previewStart is the line index where the preview section begins
function buildListPage() {
  const lines = [];
  lines.push("");
  lines.push(
    `  ${c.bold}${c.cyan}✦ ccnow${c.reset}  ${c.dim}quick & cute tools for Claude Code${c.reset}`
  );
  lines.push(`  ${c.dim}${"─".repeat(42)}${c.reset}`);
  lines.push("");

  functions.forEach((fn, i) => {
    const status = fn.getStatus();
    const selected = i === selectedIndex;
    const pointer = selected ? `${c.cyan}❯${c.reset}` : " ";
    const nameStr = selected
      ? `${c.bold}${c.white}${fn.name}${c.reset}`
      : `${c.dim}${fn.name}${c.reset}`;

    let statusStr;
    if (status.configured) {
      statusStr = `${c.green}✔ ${status.summary}${c.reset}`;
    } else {
      statusStr = `${c.dim}○ ${status.summary}${c.reset}`;
    }

    lines.push(`  ${pointer} ${nameStr}  ${statusStr}`);
  });

  lines.push("");
  lines.push(`  ${c.dim}${"─".repeat(42)}${c.reset}`);

  const previewStart = lines.length;

  // ── Inline preview of selected function ──
  const fn = functions[selectedIndex];
  if (fn.renderDetail) {
    const detailStr = fn.renderDetail();
    const detailLines = detailStr.split("\n");
    for (const dl of detailLines) {
      lines.push(dl);
    }
  } else {
    const status = fn.getStatus();
    lines.push("");
    lines.push(
      `  ${c.bold}${c.cyan}${fn.name}${c.reset} ${c.dim}— ${fn.description}${c.reset}`
    );
    lines.push("");
    if (status.configured) {
      lines.push(`  ${c.green}✔ ${status.summary}${c.reset}`);
    } else {
      lines.push(`  ${c.yellow}○ ${status.summary}${c.reset}`);
    }
    lines.push("");
  }

  lines.push(`  ${c.dim}${"─".repeat(42)}${c.reset}`);
  lines.push(
    `  ${c.dim}↑↓ navigate  ⏎ run  q quit${c.reset}`
  );
  lines.push("");

  return { lines, previewStart };
}

function buildDetailPage() {
  const fn = functions[selectedIndex];
  const lines = [];

  if (fn.renderDetail) {
    const detailStr = fn.renderDetail();
    lines.push(...detailStr.split("\n"));
  } else {
    // Default detail view
    const status = fn.getStatus();
    lines.push("");
    lines.push(
      `  ${c.bold}${c.cyan}✦ ccnow${c.reset} ${c.dim}›${c.reset} ${c.bold}${fn.name}${c.reset}`
    );
    lines.push("");
    if (status.configured) {
      lines.push(`  ${c.green}Status: Configured ✔${c.reset}`);
      lines.push(`  ${c.white}Current: ${status.summary}${c.reset}`);
    } else {
      lines.push(`  ${c.yellow}Status: Not configured${c.reset}`);
    }
    lines.push("");
    lines.push(`  ${c.white}${fn.description}${c.reset}`);
    lines.push("");
    lines.push(
      `  ${c.dim}Press Enter to run, or Esc/q to go back${c.reset}`
    );
    lines.push("");
  }

  return lines;
}

// ── Scrollable render ────────────────────────────────────────────

function renderWithScroll(allLines) {
  clearScreen();

  const maxH = termHeight();
  // Reserve 1 line for the scroll indicator at bottom
  const viewH = maxH - 1;
  const totalLines = allLines.length;

  // Clamp scrollOffset
  const maxScroll = Math.max(0, totalLines - viewH);
  if (scrollOffset > maxScroll) scrollOffset = maxScroll;
  if (scrollOffset < 0) scrollOffset = 0;

  // Slice visible portion
  const visible = allLines.slice(scrollOffset, scrollOffset + viewH);
  process.stdout.write(visible.join("\n") + "\n");

  // Show scroll indicator if content overflows
  if (totalLines > viewH) {
    const pct = maxScroll > 0
      ? Math.round((scrollOffset / maxScroll) * 100)
      : 100;
    const indicator = scrollOffset > 0 && scrollOffset < maxScroll
      ? `↑↓ ${pct}%`
      : scrollOffset === 0
        ? `↓ more`
        : `↑ top`;
    process.stdout.write(
      `  ${c.dim}── scroll: ${indicator} ──${c.reset}`
    );
  }
}

// ── Render dispatchers ───────────────────────────────────────────

function renderList() {
  const { lines, previewStart } = buildListPage();
  const viewH = termHeight() - 1;
  const totalLines = lines.length;

  // Start from top; user can scroll manually with j/k if preview overflows
  scrollOffset = 0;

  renderWithScroll(lines);
}

function renderDetail() {
  const lines = buildDetailPage();
  renderWithScroll(lines);
}

// ── Input handling ────────────────────────────────────────────────

function handleListKey(seq, name) {
  if (name === "up") {
    selectedIndex =
      (selectedIndex - 1 + functions.length) % functions.length;
    renderList();
  } else if (name === "down") {
    selectedIndex = (selectedIndex + 1) % functions.length;
    renderList();
  } else if (seq === "j") {
    // Scroll down manually (vim-style, without changing selection)
    scrollOffset++;
    const { lines } = buildListPage();
    renderWithScroll(lines);
  } else if (seq === "k") {
    // Scroll up manually
    scrollOffset = Math.max(0, scrollOffset - 1);
    const { lines } = buildListPage();
    renderWithScroll(lines);
  } else if (name === "return") {
    // Enter — if function has a detail view, show it; otherwise run directly
    const fn = functions[selectedIndex];
    if (fn.renderDetail) {
      mode = "detail";
      scrollOffset = 0;
      renderDetail();
    } else {
      clearScreen();
      showCursor();
      mode = "running";
      Promise.resolve(fn.run()).then(() => {
        console.log(`  ${c.dim}Press any key to go back...${c.reset}`);
        mode = "waitback";
      });
    }
  } else if (seq === "q" || seq === "\x03") {
    exit();
  }
}

function handleDetailKey(seq, name) {
  if (name === "escape" || seq === "q") {
    // Esc or q → back to list
    mode = "list";
    scrollOffset = 0;
    renderList();
  } else if (name === "down" || seq === "j") {
    // Try to scroll down; if content fits the screen, do nothing
    const lines = buildDetailPage();
    const viewH = termHeight() - 1;
    const maxScroll = Math.max(0, lines.length - viewH);
    if (scrollOffset < maxScroll) {
      scrollOffset++;
      renderWithScroll(lines);
    }
  } else if (name === "up" || seq === "k") {
    // Try to scroll up; if already at top, do nothing
    if (scrollOffset > 0) {
      scrollOffset--;
      const lines = buildDetailPage();
      renderWithScroll(lines);
    }
  } else if (name === "return") {
    // Enter → run the function
    clearScreen();
    showCursor();
    mode = "running";
    const fn = functions[selectedIndex];
    Promise.resolve(fn.run()).then(() => {
      console.log(`  ${c.dim}Press any key to go back...${c.reset}`);
      mode = "waitback";
    });
  } else if (seq === "\x03") {
    exit();
  }
}

function handleWaitbackKey(_seq, _name) {
  hideCursor();
  mode = "list";
  scrollOffset = 0;
  renderList();
}

// ── Main ──────────────────────────────────────────────────────────
function exit() {
  showCursor();
  clearScreen();
  process.exit(0);
}

function main() {
  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
  }

  hideCursor();
  renderList();

  process.stdin.on("keypress", (_str, key) => {
    // Use key.name for reliable detection of special keys
    const name = key && key.name;
    const seq = (key && key.sequence) || _str || "";

    if (mode === "list") handleListKey(seq, name);
    else if (mode === "detail") handleDetailKey(seq, name);
    else if (mode === "waitback") handleWaitbackKey(seq, name);
  });

  // Redraw on terminal resize
  process.stdout.on("resize", () => {
    if (mode === "list") renderList();
    else if (mode === "detail") renderDetail();
  });

  // Clean exit
  process.on("exit", () => showCursor());
  process.on("SIGINT", () => exit());
}

main();

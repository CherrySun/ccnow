# ✦ ccnow

Quick & cute tools for Claude Code.

Zero dependencies, pure Node.js. Interactive TUI with keyboard navigation.

## Install

```bash
git clone https://github.com/CherrySun/ccnow.git
cd ccnow
npm link    # makes `ccnow` available globally
```

## Usage

```bash
ccnow
```

Arrow keys to navigate, Enter to run, q to quit.

## Tools

### invalide

Restart all Claude Code sessions and resume them — preserving window layout.

- Discovers all active Claude Code sessions across Terminal windows
- Saves current window/tab layout before restart
- Restarts each session with `claude --resume`
- Restores the original Terminal layout after restart

### statusline

One-click status line presets for Claude Code.

- Browse and preview built-in status line themes
- Installs the selected preset's shell script to `~/.ccnow/statusline/`
- Updates `~/.claude/settings.json` automatically
- Includes presets like mission-control, minimal, etc.

## File Structure

```
~/.ccnow/
├── statusline/          # Status line scripts
└── terminal-layout.json # Saved terminal layout for invalide
```

## License

MIT

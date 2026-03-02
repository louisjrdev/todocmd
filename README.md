# TodoCmd (Rust + Dioxus)

TodoCmd is now a Rust desktop app built with Dioxus.

It keeps the keyboard-first daily todo workflow, local persistence, and tray-based lifecycle behavior from the original app.

## Features

- Keyboard-driven todo flow (`n`, `e`, `d`, `Space`, arrows)
- Global hotkey toggle (`Alt+K`) to show/hide TodoCmd
- Per-day todo timelines with left/right day navigation
- Todo statuses (`pending`, `important`, `in-progress`, `on-hold`, `completed`, `cancelled`)
- Daily rollover for incomplete todos (toggle in Preferences)
- Local-only JSON storage under the current user profile
- System tray menu for show, hide, and quit

## Run

```bash
cargo run
```

## Build Check

```bash
cargo fmt
cargo check
```

## Install (Windows)

Build and install TodoCmd to your user programs folder, plus add startup on login:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

This installs to `%LOCALAPPDATA%\Programs\todocmd\todocmd.exe` and creates a Startup shortcut (`TodoCmd.lnk`) so it launches when you sign in.

To uninstall:

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
```

## Keyboard Shortcuts

- `ArrowUp` / `ArrowDown` - select todo
- `Alt+K` - global show/hide toggle
- `ArrowLeft` / `ArrowRight` - previous/next day
- `n` - new todo
- `e` - edit selected todo
- `d` or `Delete` - delete selected todo
- `Space` - toggle complete/pending
- `Ctrl+I` / `Cmd+I` - toggle important
- `Ctrl+P` / `Cmd+P` - toggle in-progress
- `Ctrl+H` / `Cmd+H` - toggle on-hold
- `Ctrl+C` / `Cmd+C` - toggle completed
- `Ctrl+X` / `Cmd+X` - toggle cancelled
- `t` - jump to today
- `o` - open preferences
- `Esc` - cancel mode / close preferences / hide window

## Storage

TodoCmd stores all data locally at:

- Windows: `%LOCALAPPDATA%/todocmd/store.json`
- macOS/Linux: `${XDG_DATA_HOME:-~/.local/share}/todocmd/store.json`

No remote network storage is used.

## Migration Notes

- Rebuild plan and progress notes are tracked in `docs/rust-rebuild-plan.md`.
- Legacy Electron/Node sources were removed; the repository is now Rust-first.

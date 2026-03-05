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

## Install

Tagged releases publish release artifacts through GitHub Actions:

- macOS: `TodoCmd-macos.zip` containing `TodoCmd.app`
- Windows: `.msi` installer plus `TodoCmd-windows.zip` for portable use

The macOS release is currently ad-hoc signed in CI. That improves bundle integrity, but it is not notarized, so macOS may still require `Open` from the context menu or a manual override in System Settings.

## Keyboard Shortcuts

- `ArrowUp` / `ArrowDown` - select todo
- `Ctrl+Shift+ArrowUp` / `Ctrl+Shift+ArrowDown` - reorder selected todo
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

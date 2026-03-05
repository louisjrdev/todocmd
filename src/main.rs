#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::rc::Rc;
use std::str::FromStr;
use std::time::Duration;

use chrono::{Datelike, Local, NaiveDate};
use dioxus::desktop::{Config, WindowCloseBehaviour, use_window};
use dioxus::prelude::ScrollBehavior;
use dioxus::prelude::keyboard_types::Modifiers;
use dioxus::prelude::*;
use dioxus_desktop::HotKeyState;
use dioxus_desktop::tao::dpi::LogicalSize;
use dioxus_desktop::tao::window::WindowBuilder;
use dioxus_desktop::trayicon::menu::{Menu, MenuEvent, MenuId, MenuItem};
use dioxus_desktop::trayicon::{TrayIcon, init_tray_icon};
use dioxus_desktop::{use_muda_event_handler, use_tray_menu_event_handler};
use futures_timer::Delay;
use global_hotkey::hotkey::HotKey;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const APP_NAME: &str = "TodoCmd";
const SCHEMA_VERSION: u8 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum TodoStatus {
    Pending,
    Important,
    InProgress,
    OnHold,
    Completed,
    Cancelled,
}

impl TodoStatus {
    fn is_incomplete(self) -> bool {
        !matches!(self, Self::Completed | Self::Cancelled)
    }

    fn as_label(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Important => "important",
            Self::InProgress => "in-progress",
            Self::OnHold => "on-hold",
            Self::Completed => "completed",
            Self::Cancelled => "cancelled",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct Todo {
    id: String,
    text: String,
    status: TodoStatus,
    created_at: String,
    #[serde(default)]
    order: i64,
    completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Settings {
    enable_todo_rollover: bool,
    #[serde(default)]
    shortcuts: ShortcutSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ShortcutSettings {
    global_toggle: String,
    close_window: String,
    move_selection_up: String,
    move_selection_down: String,
    move_todo_up: String,
    move_todo_down: String,
    previous_day: String,
    next_day: String,
    confirm: String,
    toggle_selected: String,
    new_todo: String,
    edit_todo: String,
    delete_todo: String,
    jump_today: String,
    open_preferences: String,
    mark_important: String,
    mark_in_progress: String,
    mark_on_hold: String,
    mark_completed: String,
    mark_cancelled: String,
}

impl Default for ShortcutSettings {
    fn default() -> Self {
        Self {
            global_toggle: "Alt+K".to_string(),
            close_window: "Escape".to_string(),
            move_selection_up: "ArrowUp".to_string(),
            move_selection_down: "ArrowDown".to_string(),
            move_todo_up: "CmdOrCtrl+Shift+ArrowUp".to_string(),
            move_todo_down: "CmdOrCtrl+Shift+ArrowDown".to_string(),
            previous_day: "ArrowLeft".to_string(),
            next_day: "ArrowRight".to_string(),
            confirm: "Enter".to_string(),
            toggle_selected: "Space".to_string(),
            new_todo: "N".to_string(),
            edit_todo: "E".to_string(),
            delete_todo: "Delete, Backspace, D".to_string(),
            jump_today: "T".to_string(),
            open_preferences: "O".to_string(),
            mark_important: "CmdOrCtrl+I".to_string(),
            mark_in_progress: "CmdOrCtrl+P".to_string(),
            mark_on_hold: "CmdOrCtrl+H".to_string(),
            mark_completed: "CmdOrCtrl+C".to_string(),
            mark_cancelled: "CmdOrCtrl+X".to_string(),
        }
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            enable_todo_rollover: true,
            shortcuts: ShortcutSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AppStore {
    schema_version: u8,
    last_accessed: String,
    todos: BTreeMap<String, Vec<Todo>>,
    settings: Settings,
}

impl Default for AppStore {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            last_accessed: date_key(today()),
            todos: BTreeMap::new(),
            settings: Settings::default(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum InputMode {
    View,
    Add,
    Edit,
}

#[derive(Debug, Clone)]
struct UiState {
    store: AppStore,
    current_date: NaiveDate,
    todos: Vec<Todo>,
    selected_index: usize,
    mode: InputMode,
    input: String,
    editing_id: Option<String>,
    show_preferences: bool,
    shortcut_drafts: ShortcutSettings,
    shortcut_error: Option<String>,
}

impl UiState {
    fn new(mut store: AppStore) -> Self {
        rollover_todos_if_needed(&mut store);
        let current_date = today();
        let mut state = Self {
            store,
            current_date,
            todos: vec![],
            selected_index: 0,
            mode: InputMode::View,
            input: String::new(),
            editing_id: None,
            show_preferences: false,
            shortcut_drafts: ShortcutSettings::default(),
            shortcut_error: None,
        };
        state.shortcut_drafts = state.store.settings.shortcuts.clone();
        state.sync_todos_from_store();
        state
    }

    fn sync_todos_from_store(&mut self) {
        let key = date_key(self.current_date);
        let mut day_todos = self.store.todos.get(&key).cloned().unwrap_or_default();
        sort_todos(&mut day_todos);
        self.todos = day_todos;
        self.clamp_selection();
    }

    fn write_todos_to_store(&mut self) {
        let key = date_key(self.current_date);
        self.store.todos.insert(key, self.todos.clone());
        self.store.last_accessed = date_key(today());
    }

    fn clamp_selection(&mut self) {
        if self.todos.is_empty() {
            self.selected_index = 0;
            return;
        }
        self.selected_index = self.selected_index.min(self.todos.len().saturating_sub(1));
    }

    fn reset_mode(&mut self) {
        self.mode = InputMode::View;
        self.input.clear();
        self.editing_id = None;
    }

    fn open_preferences(&mut self) {
        self.shortcut_drafts = self.store.settings.shortcuts.clone();
        self.shortcut_error = None;
        self.show_preferences = true;
    }

    fn close_preferences(&mut self) {
        self.shortcut_error = None;
        self.show_preferences = false;
    }
}

#[derive(Clone)]
struct ShortcutBinding {
    key: String,
    shift: bool,
    alt: bool,
    ctrl: bool,
    meta: bool,
    cmd_or_ctrl: bool,
}

#[derive(Clone)]
struct TrayItems {
    _tray_icon: TrayIcon,
    show_id: MenuId,
    hide_id: MenuId,
    quit_id: MenuId,
}

fn main() {
    let window = WindowBuilder::new()
        .with_title(APP_NAME)
        .with_inner_size(LogicalSize::new(620.0, 560.0))
        .with_resizable(false)
        .with_decorations(false)
        .with_transparent(true)
        .with_visible(true)
        .with_always_on_top(true);

    let cfg = Config::new()
        .with_window(window)
        .with_close_behaviour(WindowCloseBehaviour::WindowHides)
        .with_disable_context_menu(true);

    LaunchBuilder::desktop().with_cfg(cfg).launch(App);
}

#[component]
fn App() -> Element {
    let desktop = use_window();
    let desktop_for_tray = desktop.clone();
    let desktop_for_keys = desktop.clone();
    let desktop_for_hotkey = desktop.clone();
    let mut app_state = use_signal(|| UiState::new(load_store()));
    let mut shell_element = use_signal(|| None::<Rc<MountedData>>);
    let mut todo_row_elements = use_signal(BTreeMap::<String, Rc<MountedData>>::new);
    let quit_requested = use_signal(|| false);
    let global_shortcut_handle = use_signal(|| None::<dioxus_desktop::ShortcutHandle>);
    let registered_global_shortcut = use_signal(String::new);

    use_effect({
        let desktop_for_hotkey = desktop_for_hotkey.clone();
        let mut global_shortcut_handle = global_shortcut_handle;
        let mut registered_global_shortcut = registered_global_shortcut;
        let app_state = app_state;
        move || {
            let configured = app_state
                .read()
                .store
                .settings
                .shortcuts
                .global_toggle
                .clone();
            if *registered_global_shortcut.read() == configured {
                return;
            }

            if let Some(handle) = global_shortcut_handle.write().take() {
                handle.remove();
            }

            if let Ok(hotkey) = HotKey::from_str(&configured) {
                let desktop_for_callback = desktop_for_hotkey.clone();
                if let Ok(handle) = desktop_for_hotkey.create_shortcut(hotkey, move |state| {
                    if !matches!(state, HotKeyState::Pressed) {
                        return;
                    }

                    let is_visible = desktop_for_callback.window.is_visible();
                    if is_visible {
                        desktop_for_callback.window.set_visible(false);
                    } else {
                        desktop_for_callback.window.set_visible(true);
                        desktop_for_callback.window.set_focus();
                    }
                }) {
                    global_shortcut_handle.set(Some(handle));
                }
            }

            registered_global_shortcut.set(configured);
        }
    });

    let tray_items = use_hook(|| {
        let menu = Menu::new();
        let show_item = MenuItem::with_id("show", "Show TodoCmd", true, None);
        let hide_item = MenuItem::with_id("hide", "Hide TodoCmd", true, None);
        let quit_item = MenuItem::with_id("quit", "Quit", true, None);

        menu.append_items(&[&show_item, &hide_item, &quit_item])
            .expect("failed to build tray menu");

        let tray_icon = init_tray_icon(menu, None);

        TrayItems {
            _tray_icon: tray_icon,
            show_id: show_item.id().clone(),
            hide_id: hide_item.id().clone(),
            quit_id: quit_item.id().clone(),
        }
    });

    use_tray_menu_event_handler({
        let tray_items = tray_items.clone();
        let desktop_for_tray = desktop_for_tray.clone();
        let mut quit_requested = quit_requested;
        move |event: &MenuEvent| {
            if event.id == tray_items.show_id {
                desktop_for_tray.window.set_visible(true);
                desktop_for_tray.window.set_focus();
                return;
            }

            if event.id == tray_items.hide_id {
                desktop_for_tray.window.set_visible(false);
                return;
            }

            if event.id == tray_items.quit_id {
                quit_requested.set(true);
            }
        }
    });

    use_muda_event_handler({
        let tray_items = tray_items.clone();
        let desktop_for_tray = desktop_for_tray.clone();
        let mut quit_requested = quit_requested;
        move |event| {
            if event.id == tray_items.show_id {
                desktop_for_tray.window.set_visible(true);
                desktop_for_tray.window.set_focus();
                return;
            }

            if event.id == tray_items.hide_id {
                desktop_for_tray.window.set_visible(false);
                return;
            }

            if event.id == tray_items.quit_id {
                quit_requested.set(true);
            }
        }
    });

    use_future({
        let mut app_state = app_state;
        let quit_requested = quit_requested;
        move || async move {
            loop {
                Delay::new(Duration::from_secs(30)).await;

                if *quit_requested.read() {
                    std::process::exit(0);
                }

                let mut should_save = false;
                app_state.with_mut(|state| {
                    let previous = state.store.last_accessed.clone();
                    rollover_todos_if_needed(&mut state.store);
                    let current = state.store.last_accessed.clone();
                    if previous != current {
                        state.sync_todos_from_store();
                        should_save = true;
                    }
                });

                if should_save {
                    let snapshot = app_state.read().store.clone();
                    let _ = save_store(&snapshot);
                }
            }
        }
    });

    let snapshot = app_state.read().clone();
    let date_title = human_date(snapshot.current_date);
    let footer_hints = footer_hints(&snapshot.store.settings.shortcuts);
    let completed_count = snapshot
        .todos
        .iter()
        .filter(|todo| matches!(todo.status, TodoStatus::Completed))
        .count();

    rsx! {
        style { {APP_STYLES} }

        div {
            class: "shell",
            tabindex: "0",
            autofocus: "true",
            onkeydown: move |event| {
                let key = event.key().to_string();
                let modifiers = event.modifiers();
                let mut should_save = false;
                let mut hide_window = false;
                let mut should_refocus_shell = false;
                let mut should_scroll_selected_todo = false;

                app_state.with_mut(|state| {
                    let shortcuts = state.store.settings.shortcuts.clone();

                    if shortcut_matches(&shortcuts.close_window, &key, modifiers) {
                        if state.show_preferences {
                            state.close_preferences();
                        } else if !matches!(state.mode, InputMode::View) {
                            state.reset_mode();
                            should_refocus_shell = true;
                        } else {
                            hide_window = true;
                        }
                    } else if shortcut_matches(&shortcuts.move_todo_up, &key, modifiers) {
                        if matches!(state.mode, InputMode::View)
                            && !state.todos.is_empty()
                            && move_selected_todo(state, MoveDirection::Up)
                        {
                            should_save = true;
                            should_scroll_selected_todo = true;
                        }
                    } else if shortcut_matches(&shortcuts.move_todo_down, &key, modifiers) {
                        if matches!(state.mode, InputMode::View)
                            && !state.todos.is_empty()
                            && move_selected_todo(state, MoveDirection::Down)
                        {
                            should_save = true;
                            should_scroll_selected_todo = true;
                        }
                    } else if shortcut_matches(&shortcuts.move_selection_up, &key, modifiers) {
                        if matches!(state.mode, InputMode::View) && !state.todos.is_empty() {
                            state.selected_index = state.selected_index.saturating_sub(1);
                            should_scroll_selected_todo = true;
                        }
                    } else if shortcut_matches(&shortcuts.move_selection_down, &key, modifiers) {
                        if matches!(state.mode, InputMode::View) && !state.todos.is_empty() {
                            state.selected_index =
                                (state.selected_index + 1).min(state.todos.len().saturating_sub(1));
                            should_scroll_selected_todo = true;
                        }
                    } else if shortcut_matches(&shortcuts.previous_day, &key, modifiers) {
                        if matches!(state.mode, InputMode::View) {
                            state.current_date = state.current_date.pred_opt().unwrap_or(state.current_date);
                            state.sync_todos_from_store();
                        }
                    } else if shortcut_matches(&shortcuts.next_day, &key, modifiers) {
                        if matches!(state.mode, InputMode::View) {
                            state.current_date = state.current_date.succ_opt().unwrap_or(state.current_date);
                            state.sync_todos_from_store();
                        }
                    } else if shortcut_matches(&shortcuts.confirm, &key, modifiers) {
                        match state.mode {
                            InputMode::Add => {
                                let trimmed = state.input.trim();
                                if !trimmed.is_empty() {
                                    let todo = Todo {
                                        id: Uuid::new_v4().to_string(),
                                        text: trimmed.to_string(),
                                        status: TodoStatus::Pending,
                                        created_at: date_key(state.current_date),
                                        order: top_todo_order(&state.todos),
                                        completed_at: None,
                                    };
                                    let todo_id = todo.id.clone();
                                    state.todos.push(todo);
                                    sort_todos(&mut state.todos);
                                    state.selected_index = state
                                        .todos
                                        .iter()
                                        .position(|todo| todo.id == todo_id)
                                        .unwrap_or(0);
                                    state.write_todos_to_store();
                                    state.reset_mode();
                                    should_save = true;
                                    should_refocus_shell = true;
                                }
                            }
                            InputMode::Edit => {
                                let Some(editing_id) = state.editing_id.clone() else {
                                    state.reset_mode();
                                    return;
                                };
                                let trimmed = state.input.trim().to_string();

                                if trimmed.is_empty() {
                                    state.todos.retain(|todo| todo.id != editing_id);
                                } else if let Some(todo) = state.todos.iter_mut().find(|todo| todo.id == editing_id) {
                                    todo.text = trimmed;
                                }

                                sort_todos(&mut state.todos);
                                state.write_todos_to_store();
                                state.reset_mode();
                                state.clamp_selection();
                                should_save = true;
                                should_refocus_shell = true;
                            }
                            InputMode::View => {
                                toggle_selected_todo(state);
                                should_save = true;
                            }
                        }
                    } else if shortcut_matches(&shortcuts.toggle_selected, &key, modifiers) {
                        if matches!(state.mode, InputMode::View) {
                            toggle_selected_todo(state);
                            should_save = true;
                        }
                    } else if shortcut_matches(&shortcuts.new_todo, &key, modifiers) {
                        if matches!(state.mode, InputMode::View) {
                            state.mode = InputMode::Add;
                            state.input.clear();
                        }
                    } else if shortcut_matches(&shortcuts.edit_todo, &key, modifiers) {
                        if matches!(state.mode, InputMode::View)
                            && !state.todos.is_empty()
                            && state.selected_index < state.todos.len()
                        {
                            let todo = &state.todos[state.selected_index];
                            state.mode = InputMode::Edit;
                            state.input = todo.text.clone();
                            state.editing_id = Some(todo.id.clone());
                        }
                    } else if shortcut_matches(&shortcuts.delete_todo, &key, modifiers) {
                        if matches!(state.mode, InputMode::View)
                            && !state.todos.is_empty()
                            && state.selected_index < state.todos.len()
                        {
                            state.todos.remove(state.selected_index);
                            state.clamp_selection();
                            state.write_todos_to_store();
                            should_save = true;
                        }
                    } else if shortcut_matches(&shortcuts.jump_today, &key, modifiers) {
                        if matches!(state.mode, InputMode::View) {
                            state.current_date = today();
                            state.sync_todos_from_store();
                        }
                    } else if shortcut_matches(&shortcuts.open_preferences, &key, modifiers) {
                        if matches!(state.mode, InputMode::View) {
                            if state.show_preferences {
                                state.close_preferences();
                            } else {
                                state.open_preferences();
                            }
                        }
                    } else if shortcut_matches(&shortcuts.mark_important, &key, modifiers) {
                        if matches!(state.mode, InputMode::View) {
                            set_selected_status(state, TodoStatus::Important);
                            should_save = true;
                        }
                    } else if shortcut_matches(&shortcuts.mark_in_progress, &key, modifiers) {
                        if matches!(state.mode, InputMode::View) {
                            set_selected_status(state, TodoStatus::InProgress);
                            should_save = true;
                        }
                    } else if shortcut_matches(&shortcuts.mark_on_hold, &key, modifiers) {
                        if matches!(state.mode, InputMode::View) {
                            set_selected_status(state, TodoStatus::OnHold);
                            should_save = true;
                        }
                    } else if shortcut_matches(&shortcuts.mark_completed, &key, modifiers) {
                        if matches!(state.mode, InputMode::View) {
                            set_selected_status(state, TodoStatus::Completed);
                            should_save = true;
                        }
                    } else if shortcut_matches(&shortcuts.mark_cancelled, &key, modifiers)
                        && matches!(state.mode, InputMode::View)
                    {
                        set_selected_status(state, TodoStatus::Cancelled);
                        should_save = true;
                    }
                });

                if hide_window {
                    desktop_for_keys.window.set_visible(false);
                }

                if should_refocus_shell {
                    let shell = shell_element.read().clone();
                    if let Some(shell) = shell {
                        spawn(async move {
                            let _ = shell.set_focus(true).await;
                        });
                    }
                }

                if should_scroll_selected_todo {
                    let selected_todo_id = app_state
                        .read()
                        .todos
                        .get(app_state.read().selected_index)
                        .map(|todo| todo.id.clone());

                    if let Some(selected_todo_id) = selected_todo_id {
                        let selected_row = todo_row_elements.read().get(&selected_todo_id).cloned();
                        if let Some(selected_row) = selected_row {
                            spawn(async move {
                                let _ = selected_row.scroll_to(ScrollBehavior::Instant).await;
                            });
                        }
                    }
                }

                if should_save {
                    let snapshot = app_state.read().store.clone();
                    let _ = save_store(&snapshot);
                }
            },
            onmounted: move |event| {
                shell_element.set(Some(event.data()));
            },

            div {
                class: "window",
                div {
                    class: "header",
                    div { class: "date-title", "{date_title}" }
                    div { class: "meta", "{completed_count}/{snapshot.todos.len()} complete" }
                }

                div {
                    class: "content",

                    if matches!(snapshot.mode, InputMode::Add | InputMode::Edit) {
                        input {
                            class: "todo-input",
                            value: "{snapshot.input}",
                            autofocus: "true",
                            onmounted: move |event| async move {
                                let _ = event.data().set_focus(true).await;
                            },
                            placeholder: if matches!(snapshot.mode, InputMode::Add) { "Add a new todo" } else { "Edit todo" },
                            oninput: move |event| {
                                app_state.with_mut(|state| {
                                    state.input = event.value();
                                });
                            }
                        }
                    }

                    div { class: "todo-list",
                        if snapshot.todos.is_empty() {
                            div { class: "empty", "No todos for {date_title.to_lowercase()}" }
                        } else {
                            for (index, todo) in snapshot.todos.iter().enumerate() {
                                div {
                                    key: "{todo.id}",
                                    class: "todo-row {todo.status.as_label()} {selected_class(matches!(snapshot.mode, InputMode::View) && index == snapshot.selected_index)}",
                                    onmounted: {
                                        let todo_id = todo.id.clone();
                                        move |event| {
                                            todo_row_elements.with_mut(|elements| {
                                                elements.insert(todo_id.clone(), event.data());
                                            });
                                        }
                                    },
                                    span { class: "badge", "{status_icon(todo.status)}" }
                                    span { class: "text", "{todo.text}" }
                                }
                            }
                        }
                    }
                }

                div {
                    class: "footer",
                    div { class: "hint-list",
                        for (label, shortcut) in footer_hints {
                            div { class: "hint-chip",
                                span { class: "hint-key", "{shortcut}" }
                                span { class: "hint-label", "{label}" }
                            }
                        }
                    }
                }
            }

            if snapshot.show_preferences {
                div {
                    class: "overlay",
                    onclick: move |_| {
                        app_state.with_mut(|state| {
                            state.close_preferences();
                        });
                    },

                    div {
                        class: "modal",
                        onclick: move |event| event.stop_propagation(),
                        h2 { "Preferences" }
                        div { class: "preferences-section",
                            h3 { "Behavior" }
                            label {
                                class: "toggle-row",
                                input {
                                    r#type: "checkbox",
                                    checked: snapshot.store.settings.enable_todo_rollover,
                                    onchange: move |event| {
                                        let checked = event.checked();
                                        app_state.with_mut(|state| {
                                            state.store.settings.enable_todo_rollover = checked;
                                        });
                                        let snapshot = app_state.read().store.clone();
                                        let _ = save_store(&snapshot);
                                    }
                                }
                                span { "Enable daily rollover for incomplete todos" }
                            }
                        }
                        div { class: "preferences-section",
                            h3 { "Shortcuts" }
                            p { class: "modal-note", "Use `+` between modifiers and keys, and commas for alternates. Example: `Delete, Backspace, D` or `CmdOrCtrl+Shift+ArrowUp`." }
                            ShortcutField {
                                label: "Global Toggle".to_string(),
                                hint: "System-wide show/hide shortcut.".to_string(),
                                value: snapshot.shortcut_drafts.global_toggle.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.global_toggle = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "Close Or Hide".to_string(),
                                hint: "Hide the window or close Preferences.".to_string(),
                                value: snapshot.shortcut_drafts.close_window.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.close_window = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "Select Previous Todo".to_string(),
                                hint: "Move the selection up.".to_string(),
                                value: snapshot.shortcut_drafts.move_selection_up.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.move_selection_up = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "Select Next Todo".to_string(),
                                hint: "Move the selection down.".to_string(),
                                value: snapshot.shortcut_drafts.move_selection_down.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.move_selection_down = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "Move Todo Up".to_string(),
                                hint: "Reorder the selected todo upward.".to_string(),
                                value: snapshot.shortcut_drafts.move_todo_up.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.move_todo_up = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "Move Todo Down".to_string(),
                                hint: "Reorder the selected todo downward.".to_string(),
                                value: snapshot.shortcut_drafts.move_todo_down.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.move_todo_down = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "Previous Day".to_string(),
                                hint: "Jump to the previous day.".to_string(),
                                value: snapshot.shortcut_drafts.previous_day.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.previous_day = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "Next Day".to_string(),
                                hint: "Jump to the next day.".to_string(),
                                value: snapshot.shortcut_drafts.next_day.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.next_day = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "Confirm".to_string(),
                                hint: "Submit add/edit or toggle in view mode.".to_string(),
                                value: snapshot.shortcut_drafts.confirm.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.confirm = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "Toggle Selected".to_string(),
                                hint: "Toggle the selected todo state in view mode.".to_string(),
                                value: snapshot.shortcut_drafts.toggle_selected.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.toggle_selected = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "New Todo".to_string(),
                                hint: "Enter add mode.".to_string(),
                                value: snapshot.shortcut_drafts.new_todo.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.new_todo = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "Edit Todo".to_string(),
                                hint: "Edit the selected todo.".to_string(),
                                value: snapshot.shortcut_drafts.edit_todo.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.edit_todo = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "Delete Todo".to_string(),
                                hint: "Delete the selected todo.".to_string(),
                                value: snapshot.shortcut_drafts.delete_todo.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.delete_todo = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "Jump To Today".to_string(),
                                hint: "Return to today.".to_string(),
                                value: snapshot.shortcut_drafts.jump_today.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.jump_today = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "Open Preferences".to_string(),
                                hint: "Open or close this modal.".to_string(),
                                value: snapshot.shortcut_drafts.open_preferences.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.open_preferences = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "Mark Important".to_string(),
                                hint: "Toggle important status.".to_string(),
                                value: snapshot.shortcut_drafts.mark_important.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.mark_important = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "Mark In Progress".to_string(),
                                hint: "Toggle in-progress status.".to_string(),
                                value: snapshot.shortcut_drafts.mark_in_progress.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.mark_in_progress = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "Mark On Hold".to_string(),
                                hint: "Toggle on-hold status.".to_string(),
                                value: snapshot.shortcut_drafts.mark_on_hold.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.mark_on_hold = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "Mark Completed".to_string(),
                                hint: "Toggle completed status.".to_string(),
                                value: snapshot.shortcut_drafts.mark_completed.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.mark_completed = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            ShortcutField {
                                label: "Mark Cancelled".to_string(),
                                hint: "Toggle cancelled status.".to_string(),
                                value: snapshot.shortcut_drafts.mark_cancelled.clone(),
                                oninput: move |event: FormEvent| {
                                    app_state.with_mut(|state| {
                                        state.shortcut_drafts.mark_cancelled = event.value();
                                        state.shortcut_error = None;
                                    });
                                }
                            }
                            if let Some(error) = snapshot.shortcut_error.clone() {
                                p { class: "shortcut-error", "{error}" }
                            }
                            div { class: "shortcut-actions",
                                button {
                                    class: "secondary-button",
                                    onclick: move |_| {
                                        app_state.with_mut(|state| {
                                            state.shortcut_drafts = ShortcutSettings::default();
                                            state.shortcut_error = None;
                                        });
                                    },
                                    "Restore Defaults"
                                }
                                button {
                                    class: "primary-button",
                                    onclick: move |_| {
                                        let drafts = app_state.read().shortcut_drafts.clone();
                                        match normalize_shortcut_settings(&drafts)
                                            .and_then(|normalized| validate_global_shortcut(&normalized.global_toggle).map(|_| normalized))
                                        {
                                            Ok(normalized) => {
                                                app_state.with_mut(|state| {
                                                    state.store.settings.shortcuts = normalized.clone();
                                                    state.shortcut_drafts = normalized;
                                                    state.shortcut_error = None;
                                                });
                                                let snapshot = app_state.read().store.clone();
                                                let _ = save_store(&snapshot);
                                            }
                                            Err(error) => {
                                                app_state.with_mut(|state| {
                                                    state.shortcut_error = Some(error);
                                                });
                                            }
                                        }
                                    },
                                    "Save Shortcuts"
                                }
                            }
                        }
                        p { class: "modal-note", "Esc closes this window. Data stays local on this machine." }
                    }
                }
            }
        }
    }
}

#[component]
fn ShortcutField(
    label: String,
    hint: String,
    value: String,
    oninput: EventHandler<FormEvent>,
) -> Element {
    rsx! {
        label { class: "shortcut-row",
            span { class: "shortcut-label", "{label}" }
            span { class: "shortcut-hint", "{hint}" }
            input {
                class: "shortcut-input",
                value: "{value}",
                onkeydown: move |event| event.stop_propagation(),
                oninput: move |event| oninput.call(event),
            }
        }
    }
}

fn footer_hints(shortcuts: &ShortcutSettings) -> Vec<(&'static str, String)> {
    vec![
        ("new", footer_shortcut(&shortcuts.new_todo)),
        ("edit", footer_shortcut(&shortcuts.edit_todo)),
        ("delete", footer_shortcut(&shortcuts.delete_todo)),
        ("toggle", footer_shortcut(&shortcuts.toggle_selected)),
        ("settings", footer_shortcut(&shortcuts.open_preferences)),
    ]
}

fn footer_shortcut(shortcuts: &str) -> String {
    shortcuts
        .split(',')
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(shortcuts)
        .to_string()
}

fn toggle_selected_todo(state: &mut UiState) {
    if state.todos.is_empty() || state.selected_index >= state.todos.len() {
        return;
    }

    let todo = &mut state.todos[state.selected_index];
    if matches!(todo.status, TodoStatus::Completed) {
        todo.status = TodoStatus::Pending;
        todo.completed_at = None;
    } else {
        todo.status = TodoStatus::Completed;
        todo.completed_at = Some(Local::now().to_rfc3339());
    }

    sort_todos(&mut state.todos);
    state.write_todos_to_store();
    state.clamp_selection();
}

fn set_selected_status(state: &mut UiState, status: TodoStatus) {
    if state.todos.is_empty() || state.selected_index >= state.todos.len() {
        return;
    }

    let todo = &mut state.todos[state.selected_index];
    if todo.status == status {
        todo.status = TodoStatus::Pending;
        todo.completed_at = None;
    } else {
        todo.status = status;
        if matches!(status, TodoStatus::Completed) {
            todo.completed_at = Some(Local::now().to_rfc3339());
        } else {
            todo.completed_at = None;
        }
    }

    sort_todos(&mut state.todos);
    state.write_todos_to_store();
    state.clamp_selection();
}

#[derive(Clone, Copy)]
enum MoveDirection {
    Up,
    Down,
}

fn move_selected_todo(state: &mut UiState, direction: MoveDirection) -> bool {
    if state.todos.is_empty() || state.selected_index >= state.todos.len() {
        return false;
    }

    let selected_index = state.selected_index;
    let selected_id = state.todos[selected_index].id.clone();
    let selected_done = is_done_status(state.todos[selected_index].status);
    let swap_index = match direction {
        MoveDirection::Up => (0..selected_index)
            .rev()
            .find(|&index| is_done_status(state.todos[index].status) == selected_done),
        MoveDirection::Down => ((selected_index + 1)..state.todos.len())
            .find(|&index| is_done_status(state.todos[index].status) == selected_done),
    };

    let Some(swap_index) = swap_index else {
        return false;
    };

    let selected_order = state.todos[selected_index].order;
    let swap_order = state.todos[swap_index].order;
    state.todos[selected_index].order = swap_order;
    state.todos[swap_index].order = selected_order;
    sort_todos(&mut state.todos);
    state.selected_index = state
        .todos
        .iter()
        .position(|todo| todo.id == selected_id)
        .unwrap_or(selected_index);
    state.write_todos_to_store();
    true
}

fn status_icon(status: TodoStatus) -> &'static str {
    match status {
        TodoStatus::Pending => "○",
        TodoStatus::Important => "!",
        TodoStatus::InProgress => "~",
        TodoStatus::OnHold => "•",
        TodoStatus::Completed => "✓",
        TodoStatus::Cancelled => "✕",
    }
}

fn selected_class(is_selected: bool) -> &'static str {
    if is_selected { "selected" } else { "" }
}

fn shortcut_matches(shortcuts: &str, key: &str, modifiers: Modifiers) -> bool {
    parse_shortcut_list(shortcuts)
        .map(|bindings| {
            bindings
                .iter()
                .any(|binding| shortcut_binding_matches(binding, key, modifiers))
        })
        .unwrap_or(false)
}

fn shortcut_binding_matches(binding: &ShortcutBinding, key: &str, modifiers: Modifiers) -> bool {
    let key = canonicalize_event_key(key);
    let expected_ctrl = binding.ctrl || (binding.cmd_or_ctrl && !cfg!(target_os = "macos"));
    let expected_meta = binding.meta || (binding.cmd_or_ctrl && cfg!(target_os = "macos"));

    key == binding.key
        && modifiers.shift() == binding.shift
        && modifiers.alt() == binding.alt
        && modifiers.ctrl() == expected_ctrl
        && modifiers.meta() == expected_meta
}

fn parse_shortcut_list(raw: &str) -> Result<Vec<ShortcutBinding>, String> {
    let bindings = raw
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(parse_shortcut_binding)
        .collect::<Result<Vec<_>, _>>()?;

    if bindings.is_empty() {
        return Err("Shortcut cannot be empty.".to_string());
    }

    Ok(bindings)
}

fn parse_shortcut_binding(raw: &str) -> Result<ShortcutBinding, String> {
    let tokens = raw
        .split('+')
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .collect::<Vec<_>>();

    if tokens.is_empty() {
        return Err("Shortcut cannot be empty.".to_string());
    }

    let mut shift = false;
    let mut alt = false;
    let mut ctrl = false;
    let mut meta = false;
    let mut cmd_or_ctrl = false;

    for token in &tokens[..tokens.len().saturating_sub(1)] {
        match token.to_ascii_uppercase().as_str() {
            "SHIFT" => shift = true,
            "ALT" | "OPTION" => alt = true,
            "CTRL" | "CONTROL" => ctrl = true,
            "CMD" | "COMMAND" | "SUPER" | "META" => meta = true,
            "PRIMARY" | "CMDORCTRL" | "CMDORCONTROL" | "COMMANDORCTRL" | "COMMANDORCONTROL" => {
                cmd_or_ctrl = true
            }
            _ => return Err(format!("Unsupported modifier `{token}` in `{raw}`.")),
        }
    }

    let key = canonicalize_shortcut_key(tokens[tokens.len() - 1])
        .ok_or_else(|| format!("Unsupported key `{}` in `{raw}`.", tokens[tokens.len() - 1]))?;

    Ok(ShortcutBinding {
        key,
        shift,
        alt,
        ctrl,
        meta,
        cmd_or_ctrl,
    })
}

fn canonicalize_shortcut_key(raw: &str) -> Option<String> {
    let upper = raw.trim().to_ascii_uppercase();
    let key = match upper.as_str() {
        "SPACE" | "SPACEBAR" => "Space".to_string(),
        "ENTER" | "RETURN" => "Enter".to_string(),
        "ESC" | "ESCAPE" => "Escape".to_string(),
        "DELETE" | "DEL" => "Delete".to_string(),
        "BACKSPACE" => "Backspace".to_string(),
        "ARROWUP" | "UP" => "ArrowUp".to_string(),
        "ARROWDOWN" | "DOWN" => "ArrowDown".to_string(),
        "ARROWLEFT" | "LEFT" => "ArrowLeft".to_string(),
        "ARROWRIGHT" | "RIGHT" => "ArrowRight".to_string(),
        _ if raw.chars().count() == 1 => raw.to_ascii_uppercase(),
        _ => return None,
    };

    Some(key)
}

fn canonicalize_event_key(raw: &str) -> String {
    match raw {
        " " => "Space".to_string(),
        "Enter" => "Enter".to_string(),
        "Escape" => "Escape".to_string(),
        "Delete" => "Delete".to_string(),
        "Backspace" => "Backspace".to_string(),
        "ArrowUp" => "ArrowUp".to_string(),
        "ArrowDown" => "ArrowDown".to_string(),
        "ArrowLeft" => "ArrowLeft".to_string(),
        "ArrowRight" => "ArrowRight".to_string(),
        _ if raw.chars().count() == 1 => raw.to_ascii_uppercase(),
        _ => raw.to_string(),
    }
}

fn format_shortcut_binding(binding: &ShortcutBinding) -> String {
    let mut parts = vec![];
    if binding.cmd_or_ctrl {
        parts.push("CmdOrCtrl".to_string());
    }
    if binding.ctrl {
        parts.push("Ctrl".to_string());
    }
    if binding.meta {
        parts.push("Cmd".to_string());
    }
    if binding.alt {
        parts.push("Alt".to_string());
    }
    if binding.shift {
        parts.push("Shift".to_string());
    }
    parts.push(binding.key.clone());
    parts.join("+")
}

fn normalize_shortcut_list(label: &str, raw: &str) -> Result<String, String> {
    let bindings = parse_shortcut_list(raw).map_err(|error| format!("{label}: {error}"))?;
    Ok(bindings
        .iter()
        .map(format_shortcut_binding)
        .collect::<Vec<_>>()
        .join(", "))
}

fn normalize_shortcut_settings(settings: &ShortcutSettings) -> Result<ShortcutSettings, String> {
    Ok(ShortcutSettings {
        global_toggle: normalize_shortcut_list("Global toggle", &settings.global_toggle)?,
        close_window: normalize_shortcut_list("Close or hide", &settings.close_window)?,
        move_selection_up: normalize_shortcut_list(
            "Select previous todo",
            &settings.move_selection_up,
        )?,
        move_selection_down: normalize_shortcut_list(
            "Select next todo",
            &settings.move_selection_down,
        )?,
        move_todo_up: normalize_shortcut_list("Move todo up", &settings.move_todo_up)?,
        move_todo_down: normalize_shortcut_list("Move todo down", &settings.move_todo_down)?,
        previous_day: normalize_shortcut_list("Previous day", &settings.previous_day)?,
        next_day: normalize_shortcut_list("Next day", &settings.next_day)?,
        confirm: normalize_shortcut_list("Confirm", &settings.confirm)?,
        toggle_selected: normalize_shortcut_list("Toggle selected", &settings.toggle_selected)?,
        new_todo: normalize_shortcut_list("New todo", &settings.new_todo)?,
        edit_todo: normalize_shortcut_list("Edit todo", &settings.edit_todo)?,
        delete_todo: normalize_shortcut_list("Delete todo", &settings.delete_todo)?,
        jump_today: normalize_shortcut_list("Jump to today", &settings.jump_today)?,
        open_preferences: normalize_shortcut_list("Open preferences", &settings.open_preferences)?,
        mark_important: normalize_shortcut_list("Mark important", &settings.mark_important)?,
        mark_in_progress: normalize_shortcut_list("Mark in progress", &settings.mark_in_progress)?,
        mark_on_hold: normalize_shortcut_list("Mark on hold", &settings.mark_on_hold)?,
        mark_completed: normalize_shortcut_list("Mark completed", &settings.mark_completed)?,
        mark_cancelled: normalize_shortcut_list("Mark cancelled", &settings.mark_cancelled)?,
    })
}

fn validate_global_shortcut(shortcut: &str) -> Result<(), String> {
    let bindings = parse_shortcut_list(shortcut)?;
    if bindings.len() != 1 {
        return Err("Global toggle must use exactly one shortcut.".to_string());
    }

    HotKey::from_str(shortcut)
        .map(|_| ())
        .map_err(|error| format!("Global toggle: {error}"))
}

fn is_done_status(status: TodoStatus) -> bool {
    matches!(status, TodoStatus::Completed | TodoStatus::Cancelled)
}

fn sort_todos(todos: &mut [Todo]) {
    todos.sort_by(|a, b| {
        let a_done = is_done_status(a.status);
        let b_done = is_done_status(b.status);
        a_done
            .cmp(&b_done)
            .then_with(|| a.order.cmp(&b.order))
            .then_with(|| a.created_at.cmp(&b.created_at))
            .then_with(|| a.id.cmp(&b.id))
    });
}

fn rollover_todos_if_needed(store: &mut AppStore) {
    let today_key = date_key(today());
    if store.last_accessed == today_key {
        return;
    }

    if store.settings.enable_todo_rollover {
        let source_date = store
            .todos
            .iter()
            .rev()
            .find(|(date, list)| *date != &today_key && !list.is_empty())
            .map(|(date, _)| date.clone());

        if let Some(source_date) = source_date {
            let mut carry_over = vec![];
            if let Some(previous) = store.todos.get(&source_date) {
                for todo in previous {
                    if todo.status.is_incomplete() {
                        carry_over.push(Todo {
                            id: Uuid::new_v4().to_string(),
                            text: todo.text.clone(),
                            status: todo.status,
                            created_at: today_key.clone(),
                            order: 0,
                            completed_at: None,
                        });
                    }
                }
            }

            if !carry_over.is_empty() {
                let current = store.todos.entry(today_key.clone()).or_default();
                let next_order = next_todo_order(current);
                for (index, todo) in carry_over.iter_mut().enumerate() {
                    todo.order = next_order + index as i64;
                }
                current.extend(carry_over);
                sort_todos(current);
            }
        }
    }

    store.last_accessed = today_key;
}

fn load_store() -> AppStore {
    let path = storage_file_path();
    let Ok(raw) = fs::read_to_string(path) else {
        return AppStore::default();
    };

    let mut store = serde_json::from_str(&raw).unwrap_or_else(|_| AppStore::default());
    if store.schema_version < SCHEMA_VERSION {
        normalize_store_orders(&mut store);
    }
    store.schema_version = SCHEMA_VERSION;
    store
}

fn save_store(store: &AppStore) -> Result<(), String> {
    let path = storage_file_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let json = serde_json::to_string_pretty(store).map_err(|error| error.to_string())?;
    fs::write(path, json).map_err(|error| error.to_string())
}

fn storage_file_path() -> PathBuf {
    let base = dirs::data_local_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));

    base.join("todocmd").join("store.json")
}

fn today() -> NaiveDate {
    Local::now().date_naive()
}

fn date_key(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

fn human_date(date: NaiveDate) -> String {
    let today = today();
    let yesterday = today.pred_opt().unwrap_or(today);

    if date == today {
        "Today".to_string()
    } else if date == yesterday {
        "Yesterday".to_string()
    } else {
        format!("{:04}-{:02}-{:02}", date.year(), date.month(), date.day())
    }
}

fn next_todo_order(todos: &[Todo]) -> i64 {
    todos.iter().map(|todo| todo.order).max().unwrap_or(-1) + 1
}

fn top_todo_order(todos: &[Todo]) -> i64 {
    todos.iter().map(|todo| todo.order).min().unwrap_or(0) - 1
}

fn normalize_store_orders(store: &mut AppStore) {
    for todos in store.todos.values_mut() {
        for (index, todo) in todos.iter_mut().enumerate() {
            todo.order = index as i64;
        }
    }
}

const APP_STYLES: &str = r#"
:root {
    color-scheme: dark;
    --ctp-rosewater: #f5e0dc;
    --ctp-flamingo: #f2cdcd;
    --ctp-pink: #f5c2e7;
    --ctp-mauve: #cba6f7;
    --ctp-red: #f38ba8;
    --ctp-maroon: #eba0ac;
    --ctp-peach: #fab387;
    --ctp-yellow: #f9e2af;
    --ctp-green: #a6e3a1;
    --ctp-teal: #94e2d5;
    --ctp-sky: #89dceb;
    --ctp-sapphire: #74c7ec;
    --ctp-blue: #89b4fa;
    --ctp-lavender: #b4befe;
    --ctp-text: #cdd6f4;
    --ctp-subtext1: #bac2de;
    --ctp-subtext0: #a6adc8;
    --ctp-overlay2: #9399b2;
    --ctp-overlay1: #7f849c;
    --ctp-overlay0: #6c7086;
    --ctp-surface2: #585b70;
    --ctp-surface1: #45475a;
    --ctp-surface0: #313244;
    --ctp-base: #1e1e2e;
    --ctp-mantle: #181825;
    --ctp-crust: #11111b;
}

html, body {
    margin: 0;
    width: 100%;
    height: 100%;
    font-family: "Aptos", "Segoe UI", "Noto Sans", sans-serif;
    background: transparent;
    overflow: hidden;
}

.shell {
    width: 100vw;
    height: 100vh;
    display: grid;
    place-items: center;
    background: transparent;
    outline: none;
}

.window {
    width: min(590px, calc(100vw - 20px));
    height: min(520px, calc(100vh - 20px));
    border-radius: 16px;
    border: 1px solid rgba(116, 199, 236, 0.3);
    background: linear-gradient(160deg, var(--ctp-base) 0%, var(--ctp-mantle) 46%, var(--ctp-crust) 100%);
    box-shadow: 0 22px 48px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(12px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: rise 180ms ease-out;
}

.header {
    padding: 16px 20px 12px;
    border-bottom: 1px solid rgba(88, 91, 112, 0.55);
    display: flex;
    justify-content: space-between;
    align-items: baseline;
}

.date-title {
    color: var(--ctp-text);
    font-size: 19px;
    letter-spacing: 0.01em;
    font-weight: 600;
}

.meta {
    font-size: 13px;
    color: var(--ctp-subtext0);
}

.content {
    flex: 1;
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
}

.todo-input {
    border: 1px solid rgba(88, 91, 112, 0.85);
    background: rgba(24, 24, 37, 0.9);
    border-radius: 10px;
    color: var(--ctp-text);
    padding: 10px 12px;
    font-size: 15px;
    outline: none;
}

.todo-input:focus {
    border-color: rgba(137, 180, 250, 0.92);
    box-shadow: 0 0 0 3px rgba(137, 180, 250, 0.22);
}

.todo-list {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding-right: 4px;
}

.todo-row {
    display: flex;
    align-items: center;
    gap: 10px;
    border-radius: 10px;
    border: 1px solid rgba(69, 71, 90, 0.75);
    background: rgba(49, 50, 68, 0.62);
    padding: 10px 12px;
    color: var(--ctp-text);
}

.todo-row.selected {
    border-color: rgba(137, 180, 250, 0.95);
    box-shadow: inset 0 0 0 1px rgba(137, 180, 250, 0.4);
}

.todo-row.important { border-color: rgba(243, 139, 168, 0.75); }
.todo-row.in-progress { border-color: rgba(116, 199, 236, 0.75); }
.todo-row.on-hold { border-color: rgba(249, 226, 175, 0.78); }
.todo-row.completed {
    opacity: 0.54;
    border-color: rgba(166, 227, 161, 0.72);
    background: rgba(166, 227, 161, 0.12);
}
.todo-row.cancelled { opacity: 0.62; }

.todo-row.completed.selected {
    border-color: rgba(166, 227, 161, 0.94);
    box-shadow: inset 0 0 0 1px rgba(166, 227, 161, 0.42);
}

.todo-row.completed .text,
.todo-row.cancelled .text {
    text-decoration: line-through;
}

.badge {
    width: 18px;
    text-align: center;
    color: var(--ctp-lavender);
}

.text {
    font-size: 15px;
    line-height: 1.35;
    overflow-wrap: anywhere;
}

.empty {
    margin-top: 32px;
    text-align: center;
    color: var(--ctp-overlay2);
    font-size: 15px;
}

.footer {
    border-top: 1px solid rgba(88, 91, 112, 0.55);
    padding: 11px 18px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.hint-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 10px;
}

.hint-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 9px;
    border-radius: 999px;
    background: rgba(49, 50, 68, 0.88);
    border: 1px solid rgba(88, 91, 112, 0.55);
}

.hint-key {
    color: var(--ctp-text);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.01em;
}

.hint-label {
    color: var(--ctp-subtext1);
    font-size: 12px;
}

.overlay {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(17, 17, 27, 0.76);
}

.modal {
    width: min(560px, calc(100vw - 26px));
    max-height: min(82vh, 760px);
    border-radius: 12px;
    border: 1px solid rgba(116, 199, 236, 0.34);
    background: rgba(30, 30, 46, 0.97);
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.45);
    padding: 16px;
    overflow-y: auto;
}

.modal h2 {
    margin: 0 0 12px;
    font-size: 18px;
    color: var(--ctp-text);
}

.modal h3 {
    margin: 0 0 10px;
    font-size: 15px;
    color: var(--ctp-text);
}

.preferences-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 14px;
}

.toggle-row {
    display: flex;
    gap: 10px;
    align-items: center;
    color: var(--ctp-subtext1);
    font-size: 15px;
}

.modal-note {
    margin-top: 12px;
    font-size: 13px;
    color: var(--ctp-overlay2);
}

.shortcut-row {
    display: grid;
    gap: 6px;
}

.shortcut-label {
    color: var(--ctp-text);
    font-size: 14px;
    font-weight: 600;
}

.shortcut-hint {
    color: var(--ctp-overlay2);
    font-size: 12px;
}

.shortcut-input {
    border: 1px solid rgba(88, 91, 112, 0.85);
    background: rgba(24, 24, 37, 0.9);
    border-radius: 9px;
    color: var(--ctp-text);
    padding: 9px 11px;
    font-size: 14px;
    outline: none;
}

.shortcut-input:focus {
    border-color: rgba(137, 180, 250, 0.92);
    box-shadow: 0 0 0 3px rgba(137, 180, 250, 0.18);
}

.shortcut-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 8px;
}

.primary-button,
.secondary-button {
    border-radius: 9px;
    padding: 9px 12px;
    font-size: 13px;
    cursor: pointer;
}

.primary-button {
    border: 1px solid rgba(137, 180, 250, 0.85);
    background: rgba(137, 180, 250, 0.16);
    color: var(--ctp-text);
}

.secondary-button {
    border: 1px solid rgba(88, 91, 112, 0.8);
    background: rgba(49, 50, 68, 0.9);
    color: var(--ctp-subtext1);
}

.shortcut-error {
    margin: 0;
    color: var(--ctp-red);
    font-size: 13px;
}

@keyframes rise {
    from { transform: translateY(8px) scale(0.99); opacity: 0; }
    to { transform: translateY(0) scale(1); opacity: 1; }
}

@media (max-width: 700px) {
    .window {
        width: calc(100vw - 10px);
        height: calc(100vh - 10px);
        border-radius: 12px;
    }

    .hint-list {
        gap: 7px;
    }

    .hint-chip {
        gap: 7px;
        padding: 4px 8px;
    }

    .hint-key,
    .hint-label {
        font-size: 11px;
    }
}
"#;

#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::rc::Rc;
use std::time::Duration;

use chrono::{Datelike, Local, NaiveDate};
use dioxus::desktop::{Config, WindowCloseBehaviour, use_global_shortcut, use_window};
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
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const APP_NAME: &str = "TodoCmd";
const SCHEMA_VERSION: u8 = 2;

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
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            enable_todo_rollover: true,
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
        };
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

    let _global_toggle_shortcut = use_global_shortcut("Alt+K", move |state| {
        if !matches!(state, HotKeyState::Pressed) {
            return;
        }

        let is_visible = desktop_for_hotkey.window.is_visible();
        if is_visible {
            desktop_for_hotkey.window.set_visible(false);
        } else {
            desktop_for_hotkey.window.set_visible(true);
            desktop_for_hotkey.window.set_focus();
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
                let primary_modifier = primary_modifier_pressed(modifiers);
                let plain_shortcuts = !modifiers.alt() && !modifiers.ctrl() && !modifiers.meta();
                let mut should_save = false;
                let mut hide_window = false;
                let mut should_refocus_shell = false;
                let mut should_scroll_selected_todo = false;

                app_state.with_mut(|state| {
                    match key.as_str() {
                        "Escape" => {
                            if state.show_preferences {
                                state.show_preferences = false;
                            } else if !matches!(state.mode, InputMode::View) {
                                state.reset_mode();
                                should_refocus_shell = true;
                            } else {
                                hide_window = true;
                            }
                        }
                        "ArrowUp" => {
                            if matches!(state.mode, InputMode::View) && !state.todos.is_empty() {
                                if modifiers.ctrl() && modifiers.shift() && !modifiers.alt() && !modifiers.meta() {
                                    if move_selected_todo(state, MoveDirection::Up) {
                                        should_save = true;
                                        should_scroll_selected_todo = true;
                                    }
                                } else {
                                    state.selected_index = state.selected_index.saturating_sub(1);
                                    should_scroll_selected_todo = true;
                                }
                            }
                        }
                        "ArrowDown" => {
                            if matches!(state.mode, InputMode::View) && !state.todos.is_empty() {
                                if modifiers.ctrl() && modifiers.shift() && !modifiers.alt() && !modifiers.meta() {
                                    if move_selected_todo(state, MoveDirection::Down) {
                                        should_save = true;
                                        should_scroll_selected_todo = true;
                                    }
                                } else {
                                    state.selected_index =
                                        (state.selected_index + 1).min(state.todos.len().saturating_sub(1));
                                    should_scroll_selected_todo = true;
                                }
                            }
                        }
                        "ArrowLeft" => {
                            if matches!(state.mode, InputMode::View) {
                                state.current_date = state.current_date.pred_opt().unwrap_or(state.current_date);
                                state.sync_todos_from_store();
                            }
                        }
                        "ArrowRight" => {
                            if matches!(state.mode, InputMode::View) {
                                state.current_date = state.current_date.succ_opt().unwrap_or(state.current_date);
                                state.sync_todos_from_store();
                            }
                        }
                        " " => {
                            if plain_shortcuts && matches!(state.mode, InputMode::View) {
                                toggle_selected_todo(state);
                                should_save = true;
                            }
                        }
                        "Enter" => {
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
                        }
                        "n" | "N" => {
                            if plain_shortcuts && matches!(state.mode, InputMode::View) {
                                state.mode = InputMode::Add;
                                state.input.clear();
                            }
                        }
                        "e" | "E" => {
                            if plain_shortcuts
                                && matches!(state.mode, InputMode::View)
                                && !state.todos.is_empty()
                                && state.selected_index < state.todos.len()
                            {
                                let todo = &state.todos[state.selected_index];
                                state.mode = InputMode::Edit;
                                state.input = todo.text.clone();
                                state.editing_id = Some(todo.id.clone());
                            }
                        }
                        "Delete" | "Backspace" => {
                            if matches!(state.mode, InputMode::View)
                                && !state.todos.is_empty()
                                && state.selected_index < state.todos.len()
                            {
                                state.todos.remove(state.selected_index);
                                state.clamp_selection();
                                state.write_todos_to_store();
                                should_save = true;
                            }
                        }
                        "d" | "D" => {
                            if plain_shortcuts
                                && matches!(state.mode, InputMode::View)
                                && !state.todos.is_empty()
                                && state.selected_index < state.todos.len()
                            {
                                state.todos.remove(state.selected_index);
                                state.clamp_selection();
                                state.write_todos_to_store();
                                should_save = true;
                            }
                        }
                        "t" | "T" => {
                            if plain_shortcuts && matches!(state.mode, InputMode::View) {
                                state.current_date = today();
                                state.sync_todos_from_store();
                            }
                        }
                        "o" | "O" => {
                            if plain_shortcuts && matches!(state.mode, InputMode::View) {
                                state.show_preferences = !state.show_preferences;
                            }
                        }
                        "i" | "I" => {
                            if primary_modifier && matches!(state.mode, InputMode::View) {
                                set_selected_status(state, TodoStatus::Important);
                                should_save = true;
                            }
                        }
                        "p" | "P" => {
                            if primary_modifier && matches!(state.mode, InputMode::View) {
                                set_selected_status(state, TodoStatus::InProgress);
                                should_save = true;
                            }
                        }
                        "h" | "H" => {
                            if primary_modifier && matches!(state.mode, InputMode::View) {
                                set_selected_status(state, TodoStatus::OnHold);
                                should_save = true;
                            }
                        }
                        "c" | "C" => {
                            if primary_modifier && matches!(state.mode, InputMode::View) {
                                set_selected_status(state, TodoStatus::Completed);
                                should_save = true;
                            }
                        }
                        "x" | "X" => {
                            if primary_modifier && matches!(state.mode, InputMode::View) {
                                set_selected_status(state, TodoStatus::Cancelled);
                                should_save = true;
                            }
                        }
                        _ => {}
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
                    div { class: "hint", "n new  e edit  d delete  space toggle  t today  o settings" }
                }
            }

            if snapshot.show_preferences {
                div {
                    class: "overlay",
                    onclick: move |_| {
                        app_state.with_mut(|state| {
                            state.show_preferences = false;
                        });
                    },

                    div {
                        class: "modal",
                        onclick: move |event| event.stop_propagation(),
                        h2 { "Preferences" }
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
                        p { class: "modal-note", "Esc closes this window. Data stays local on this machine." }
                    }
                }
            }
        }
    }
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

fn primary_modifier_pressed(modifiers: Modifiers) -> bool {
    #[cfg(target_os = "macos")]
    {
        modifiers.meta()
    }

    #[cfg(not(target_os = "macos"))]
    {
        modifiers.ctrl()
    }
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
    background:
        radial-gradient(135% 95% at 12% 8%, rgba(137, 180, 250, 0.24), transparent 58%),
        radial-gradient(110% 120% at 92% 100%, rgba(148, 226, 213, 0.22), transparent 62%),
        linear-gradient(160deg, var(--ctp-base) 0%, var(--ctp-mantle) 44%, var(--ctp-crust) 100%);
    outline: none;
}

.window {
    width: min(590px, calc(100vw - 20px));
    height: min(520px, calc(100vh - 20px));
    border-radius: 16px;
    border: 1px solid rgba(116, 199, 236, 0.3);
    background: linear-gradient(180deg, rgba(30, 30, 46, 0.94), rgba(24, 24, 37, 0.97));
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
    gap: 4px;
}

.hint {
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
    width: min(430px, calc(100vw - 26px));
    border-radius: 12px;
    border: 1px solid rgba(116, 199, 236, 0.34);
    background: rgba(30, 30, 46, 0.97);
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.45);
    padding: 16px;
}

.modal h2 {
    margin: 0 0 12px;
    font-size: 18px;
    color: var(--ctp-text);
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

    .hint {
        font-size: 11px;
    }
}
"#;

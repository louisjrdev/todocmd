import { useCallback } from 'react';
import { addDays, subDays } from 'date-fns';
import { useTodoStore } from '../store/todoStore';
import { usePreferencesStore } from '../store/preferencesStore';

export const useKeyboardNavigation = () => {
  const {
    isVisible,
    mode,
    input,
    todos,
    selectedIndex,
    editingId,
    currentDate,
    addTodo,
    editTodo,
    toggleTodo,
    changeStatus,
    deleteTodo,
    setMode,
    setInput,
    setEditingId,
    setSelectedIndex,
    setCurrentDate,
    checkForUpdates,
  } = useTodoStore();

  const { openPreferences, closePreferences, settings, isOpen: preferencesOpen } = usePreferencesStore();

  // Helper function to check if a keyboard event matches a shortcut string
  const matchesShortcut = (e: KeyboardEvent, shortcut: string): boolean => {
    if (!shortcut) return false;
    
    const parts = shortcut.split('+');
    const expectedModifiers = parts.slice(0, -1);
    const expectedKey = parts[parts.length - 1];
    
    // Check modifiers
    const hasCtrl = expectedModifiers.includes('Ctrl');
    const hasCmd = expectedModifiers.includes('Cmd');
    const hasAlt = expectedModifiers.includes('Alt') || expectedModifiers.includes('Option');
    const hasShift = expectedModifiers.includes('Shift');
    
    if (e.ctrlKey !== hasCtrl) return false;
    if (e.metaKey !== hasCmd) return false;
    if (e.altKey !== hasAlt) return false;
    if (e.shiftKey !== hasShift) return false;
    
    // For the key part, check both e.key and e.code to handle special cases
    if (expectedKey === e.key) return true;
    
    // Handle cases where recording used e.code but actual use has e.key
    if (e.code.startsWith('Key') && expectedKey === e.code.replace('Key', '')) return true;
    if (e.code.startsWith('Digit') && expectedKey === e.code.replace('Digit', '')) return true;
    if (e.code.startsWith('Arrow') && expectedKey === e.code) return true;
    if (['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].includes(e.code) && expectedKey === e.code) return true;
    
    return false;
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isVisible) return;

    // Get keybindings from settings
    const keybindings = settings.keybindings;

    switch (e.key) {
      case 'Escape':
        if (preferencesOpen) {
          // If preferences are open, close them first
          closePreferences();
        } else if (mode === 'add' || mode === 'edit') {
          // If in add/edit mode, return to view mode
          setMode('view');
          setInput('');
          setEditingId(null);
        } else {
          // If in view mode and preferences are closed, hide the window
          window.electronAPI.hideWindow();
        }
        break;
        
      case 'Enter':
        e.preventDefault();
        if (mode === 'add') {
          addTodo(input);
        } else if (mode === 'edit' && editingId) {
          editTodo(editingId, input);
        } else if (mode === 'view' && todos.length > 0) {
          toggleTodo(todos[selectedIndex].id);
        }
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        if (mode === 'view' && todos.length > 0) {
          setSelectedIndex(Math.max(0, selectedIndex - 1));
        }
        break;
        
      case 'ArrowDown':
        e.preventDefault();
        if (mode === 'view' && todos.length > 0) {
          setSelectedIndex(Math.min(todos.length - 1, selectedIndex + 1));
        }
        break;
        
      case 'ArrowLeft':
        e.preventDefault();
        if (mode === 'view') {
          setCurrentDate(subDays(currentDate, 1));
        }
        break;
        
      case 'ArrowRight':
        e.preventDefault();
        if (mode === 'view') {
          setCurrentDate(addDays(currentDate, 1));
        }
        break;
        
      case ' ':
        if (mode === 'view' && todos.length > 0) {
          e.preventDefault();
          toggleTodo(todos[selectedIndex].id);
        }
        break;
        
      default:
        // Handle configurable shortcuts
        if (mode === 'view') {
          // New todo
          if (matchesShortcut(e, keybindings.navigation.newTodo)) {
            e.preventDefault();
            setMode('add');
            setInput('');
          }
          // Edit mode
          else if (matchesShortcut(e, keybindings.navigation.editMode) && todos.length > 0) {
            e.preventDefault();
            const todo = todos[selectedIndex];
            setMode('edit');
            setEditingId(todo.id);
            setInput(todo.text);
          }
          // Delete selected
          else if (matchesShortcut(e, keybindings.navigation.deleteSelected) || 
                   (e.key === 'Backspace' && e.metaKey)) {
            if (todos.length > 0) {
              e.preventDefault();
              deleteTodo(todos[selectedIndex].id);
            }
          }
          // Today view
          else if (matchesShortcut(e, keybindings.navigation.todayView)) {
            e.preventDefault();
            setCurrentDate(new Date());
          }
          // Check updates
          else if (matchesShortcut(e, keybindings.navigation.checkUpdates)) {
            e.preventDefault();
            checkForUpdates();
          }
          // Status shortcuts with toggle functionality
          else if (matchesShortcut(e, keybindings.navigation.markImportant) && todos.length > 0) {
            e.preventDefault();
            const currentTodo = todos[selectedIndex];
            const currentStatus = currentTodo.status || (currentTodo.completed ? 'completed' : 'pending');
            const newStatus = currentStatus === 'important' ? 'pending' : 'important';
            changeStatus(currentTodo.id, newStatus);
          }
          else if (matchesShortcut(e, keybindings.navigation.markInProgress) && todos.length > 0) {
            e.preventDefault();
            const currentTodo = todos[selectedIndex];
            const currentStatus = currentTodo.status || (currentTodo.completed ? 'completed' : 'pending');
            const newStatus = currentStatus === 'in-progress' ? 'pending' : 'in-progress';
            changeStatus(currentTodo.id, newStatus);
          }
          else if (matchesShortcut(e, keybindings.navigation.markOnHold) && todos.length > 0) {
            e.preventDefault();
            const currentTodo = todos[selectedIndex];
            const currentStatus = currentTodo.status || (currentTodo.completed ? 'completed' : 'pending');
            const newStatus = currentStatus === 'on-hold' ? 'pending' : 'on-hold';
            changeStatus(currentTodo.id, newStatus);
          }
          else if (matchesShortcut(e, keybindings.navigation.markCompleted) && todos.length > 0) {
            e.preventDefault();
            const currentTodo = todos[selectedIndex];
            const currentStatus = currentTodo.status || (currentTodo.completed ? 'completed' : 'pending');
            const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
            changeStatus(currentTodo.id, newStatus);
          }
          else if (matchesShortcut(e, keybindings.navigation.markCancelled) && todos.length > 0) {
            e.preventDefault();
            const currentTodo = todos[selectedIndex];
            const currentStatus = currentTodo.status || (currentTodo.completed ? 'completed' : 'pending');
            const newStatus = currentStatus === 'cancelled' ? 'pending' : 'cancelled';
            changeStatus(currentTodo.id, newStatus);
          }
          // Preferences (Ctrl+, or Cmd+,)
          else if (e.key === ',' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            openPreferences();
          }
        }
        break;
    }
  }, [
    isVisible, mode, input, todos, selectedIndex, editingId, currentDate, settings.keybindings, preferencesOpen,
    addTodo, editTodo, toggleTodo, changeStatus, deleteTodo,
    setMode, setInput, setEditingId, setSelectedIndex,
    setCurrentDate, checkForUpdates, openPreferences, closePreferences
  ]);

  return handleKeyDown;
};

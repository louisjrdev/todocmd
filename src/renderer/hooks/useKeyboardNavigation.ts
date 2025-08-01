import { useCallback } from 'react';
import { addDays, subDays } from 'date-fns';
import { useTodoStore } from '../store/todoStore';

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
    deleteTodo,
    setMode,
    setInput,
    setEditingId,
    setSelectedIndex,
    setCurrentDate,
    checkForUpdates,
  } = useTodoStore();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isVisible) return;

    switch (e.key) {
      case 'Escape':
        if (mode === 'add' || mode === 'edit') {
          setMode('view');
          setInput('');
          setEditingId(null);
        } else {
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
        
      case 'n':
        if (mode === 'view') {
          e.preventDefault();
          setMode('add');
          setInput('');
        }
        break;
        
      case 'e':
        if (mode === 'view' && todos.length > 0) {
          e.preventDefault();
          const todo = todos[selectedIndex];
          setMode('edit');
          setEditingId(todo.id);
          setInput(todo.text);
        }
        break;
        
      case 'Delete':
      case 'Backspace':
        if (mode === 'view' && (e.key === 'Delete' || (e.key === 'Backspace' && e.metaKey))) {
          if (todos.length > 0) {
            deleteTodo(todos[selectedIndex].id);
          }
        }
        break;
        
      case 't':
        if (mode === 'view') {
          e.preventDefault();
          setCurrentDate(new Date());
        }
        break;
        
      case 'u':
        if (mode === 'view') {
          e.preventDefault();
          checkForUpdates();
        }
        break;
    }
  }, [
    isVisible, mode, input, todos, selectedIndex, editingId, currentDate,
    addTodo, editTodo, toggleTodo, deleteTodo,
    setMode, setInput, setEditingId, setSelectedIndex,
    setCurrentDate, checkForUpdates
  ]);

  return handleKeyDown;
};

import { create } from 'zustand';
import { format } from 'date-fns';
import { Todo } from '../types';

interface TodoState {
  // Core state
  todos: Todo[];
  currentDate: Date;
  input: string;
  selectedIndex: number;
  mode: 'view' | 'add' | 'edit';
  editingId: string | null;
  availableDates: string[];
  isVisible: boolean;
  appVersion: string;
  updateStatus: 'idle' | 'checking' | 'available' | 'not-available' | 'error';
  
  // Actions
  setTodos: (todos: Todo[]) => void;
  setCurrentDate: (date: Date) => void;
  setInput: (input: string) => void;
  setSelectedIndex: (index: number) => void;
  setMode: (mode: 'view' | 'add' | 'edit') => void;
  setEditingId: (id: string | null) => void;
  setAvailableDates: (dates: string[]) => void;
  setIsVisible: (visible: boolean) => void;
  setAppVersion: (version: string) => void;
  setUpdateStatus: (status: 'idle' | 'checking' | 'available' | 'not-available' | 'error') => void;
  
  // Todo operations
  addTodo: (text: string) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  editTodo: (id: string, text: string) => Promise<void>;
  
  // Data loading
  loadTodos: () => Promise<void>;
  loadAvailableDates: () => Promise<void>;
  loadAppVersion: () => Promise<void>;
  
  // Utility functions
  sortTodos: (todosToSort: Todo[]) => Todo[];
  saveTodos: (todosToSave: Todo[]) => Promise<void>;
  checkForUpdates: () => Promise<void>;
  
  // Reset functions
  resetToViewMode: () => void;
  resetSelectedIndex: () => void;
}

// Computed selectors
export const useDateString = () => useTodoStore(state => format(state.currentDate, 'yyyy-MM-dd'));
export const useCompletedCount = () => useTodoStore(state => state.todos.filter(t => t.completed).length);

export const useTodoStore = create<TodoState>((set, get) => ({
  // Initial state
  todos: [],
  currentDate: new Date(),
  input: '',
  selectedIndex: 0,
  mode: 'view',
  editingId: null,
  availableDates: [],
  isVisible: false,
  appVersion: '',
  updateStatus: 'idle',
  
  // Actions
  setTodos: (todos) => set({ todos }),
  setCurrentDate: (currentDate) => set({ currentDate }),
  setInput: (input) => set({ input }),
  setSelectedIndex: (selectedIndex) => set({ selectedIndex }),
  setMode: (mode) => set({ mode }),
  setEditingId: (editingId) => set({ editingId }),
  setAvailableDates: (availableDates) => set({ availableDates }),
  setIsVisible: (isVisible) => set({ isVisible }),
  setAppVersion: (appVersion) => set({ appVersion }),
  setUpdateStatus: (updateStatus) => set({ updateStatus }),
  
  // Utility functions
  sortTodos: (todosToSort: Todo[]) => {
    return [...todosToSort].sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  },
  
  saveTodos: async (todosToSave: Todo[]) => {
    try {
      const { currentDate } = get();
      const dateString = format(currentDate, 'yyyy-MM-dd');
      await window.electronAPI.saveTodos(dateString, todosToSave);
    } catch (error) {
      console.error('Failed to save todos:', error);
    }
  },
  
  // Data loading
  loadTodos: async () => {
    try {
      const { currentDate, sortTodos } = get();
      const dateString = format(currentDate, 'yyyy-MM-dd');
      const todosForDate = await window.electronAPI.getTodos(dateString);
      set({ todos: sortTodos(todosForDate) });
    } catch (error) {
      console.error('Failed to load todos:', error);
    }
  },
  
  loadAvailableDates: async () => {
    try {
      const dates = await window.electronAPI.getAllDates();
      set({ availableDates: dates });
    } catch (error) {
      console.error('Failed to load dates:', error);
    }
  },
  
  loadAppVersion: async () => {
    try {
      const version = await (window.electronAPI as any).getAppVersion();
      set({ appVersion: version });
    } catch (error) {
      console.error('Failed to load app version:', error);
    }
  },
  
  // Todo operations
  addTodo: async (text: string) => {
    if (!text.trim()) return;
    
    const { todos, currentDate, sortTodos, saveTodos } = get();
    const dateString = format(currentDate, 'yyyy-MM-dd');
    const newTodo: Todo = {
      id: `${Date.now()}-${Math.random()}`,
      text: text.trim(),
      completed: false,
      createdAt: dateString,
    };
    
    const updatedTodos = sortTodos([newTodo, ...todos]);
    set({ 
      todos: updatedTodos,
      input: '',
      mode: 'view',
      selectedIndex: 0
    });
    await saveTodos(updatedTodos);
  },
  
  toggleTodo: async (id: string) => {
    const { todos, sortTodos, saveTodos, selectedIndex } = get();
    
    // Find the todo being toggled
    const toggledTodo = todos.find(todo => todo.id === id);
    if (!toggledTodo) return;
    
    const updatedTodos = todos.map(todo =>
      todo.id === id
        ? {
            ...todo,
            completed: !todo.completed,
            completedAt: !todo.completed ? new Date().toISOString() : undefined
          }
        : todo
    );
    const sortedTodos = sortTodos(updatedTodos);
    
    let newSelectedIndex = selectedIndex;
    
    // If we just completed a todo (it was incomplete, now complete)
    if (!toggledTodo.completed) {
      // The completed todo moved to the bottom, so we want to select the next incomplete todo
      // which is now at the same index position
      if (selectedIndex < sortedTodos.length) {
        // Find the first incomplete todo at or after the current position
        const nextIncompleteIndex = sortedTodos.findIndex((todo, index) => 
          index >= selectedIndex && !todo.completed
        );
        
        if (nextIncompleteIndex !== -1) {
          newSelectedIndex = nextIncompleteIndex;
        } else {
          // No more incomplete todos, go to the last incomplete one or first completed one
          let lastIncompleteIndex = -1;
          for (let i = sortedTodos.length - 1; i >= 0; i--) {
            if (!sortedTodos[i].completed) {
              lastIncompleteIndex = i;
              break;
            }
          }
          newSelectedIndex = lastIncompleteIndex !== -1 ? lastIncompleteIndex : 0;
        }
      }
    } else {
      // If we uncompleted a todo, it moved up in the list
      // Try to find where it ended up and select the next todo after it
      const uncompletedTodoNewIndex = sortedTodos.findIndex(todo => todo.id === id);
      if (uncompletedTodoNewIndex !== -1 && uncompletedTodoNewIndex + 1 < sortedTodos.length) {
        newSelectedIndex = uncompletedTodoNewIndex + 1;
      } else {
        newSelectedIndex = Math.min(selectedIndex, sortedTodos.length - 1);
      }
    }
    
    // Ensure the index is within bounds
    newSelectedIndex = Math.max(0, Math.min(newSelectedIndex, sortedTodos.length - 1));
    
    set({ 
      todos: sortedTodos,
      selectedIndex: newSelectedIndex
    });
    await saveTodos(sortedTodos);
  },
  
  deleteTodo: async (id: string) => {
    const { todos, selectedIndex, saveTodos } = get();
    const updatedTodos = todos.filter(todo => todo.id !== id);
    const newSelectedIndex = Math.max(0, Math.min(selectedIndex, updatedTodos.length - 1));
    
    set({ 
      todos: updatedTodos,
      selectedIndex: newSelectedIndex
    });
    await saveTodos(updatedTodos);
  },
  
  editTodo: async (id: string, newText: string) => {
    const { todos, sortTodos, saveTodos, deleteTodo } = get();
    
    if (!newText.trim()) {
      await deleteTodo(id);
      return;
    }
    
    const updatedTodos = todos.map(todo =>
      todo.id === id ? { ...todo, text: newText.trim() } : todo
    );
    const sortedTodos = sortTodos(updatedTodos);
    
    set({ 
      todos: sortedTodos,
      mode: 'view',
      editingId: null,
      input: ''
    });
    await saveTodos(sortedTodos);
  },
  
  checkForUpdates: async () => {
    const { setUpdateStatus } = get();
    try {
      console.log('🔍 Triggering update check...');
      setUpdateStatus('checking');
      await (window.electronAPI as any).checkForUpdates();
      console.log('Update check initiated - watch for results in console');
      
      // Reset status after a delay if no response
      setTimeout(() => {
        const currentStatus = get().updateStatus;
        if (currentStatus === 'checking') {
          setUpdateStatus('idle');
        }
      }, 10000);
    } catch (error) {
      console.error('Failed to trigger update check:', error);
      setUpdateStatus('error');
    }
  },
  
  // Reset functions
  resetToViewMode: () => {
    set({
      mode: 'view',
      input: '',
      editingId: null,
      selectedIndex: 0
    });
  },
  
  resetSelectedIndex: () => {
    const { todos, selectedIndex } = get();
    if (todos.length === 0) {
      set({ selectedIndex: 0 });
    } else if (selectedIndex >= todos.length) {
      set({ selectedIndex: todos.length - 1 });
    }
    // If selectedIndex is within bounds, don't change it
  },
}));

import { create } from 'zustand';
import { format } from 'date-fns';
import { Todo, TodoStatus } from '../types';

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
  changeStatus: (id: string, status: TodoStatus) => Promise<void>;
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
      
      // Add backward compatibility for status field
      const todosWithStatus = todosForDate.map((todo: any) => ({
        ...todo,
        status: todo.status || (todo.completed ? 'completed' : 'pending')
      }));
      
      set({ todos: sortTodos(todosWithStatus) });
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
      status: 'pending',
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
    const { todos, changeStatus } = get();
    
    // Find the todo being toggled
    const toggledTodo = todos.find(todo => todo.id === id);
    if (!toggledTodo) return;
    
    // Toggle between completed and pending (or restore original status)
    const currentStatus = toggledTodo.status || (toggledTodo.completed ? 'completed' : 'pending');
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    
    await changeStatus(id, newStatus);
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

  changeStatus: async (id: string, newStatus: TodoStatus) => {
    const { todos, sortTodos, saveTodos } = get();
    
    const updatedTodos = todos.map(todo =>
      todo.id === id 
        ? { 
            ...todo, 
            status: newStatus,
            completed: newStatus === 'completed',
            completedAt: newStatus === 'completed' ? new Date().toISOString() : undefined
          } 
        : todo
    );
    
    const sortedTodos = sortTodos(updatedTodos);
    set({ todos: sortedTodos });
    await saveTodos(sortedTodos);
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

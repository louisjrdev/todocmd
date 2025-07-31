import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, addDays, subDays, isToday, isYesterday } from 'date-fns';
import { Todo } from './types';
import './App.css';

const App: React.FC = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [input, setInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<'view' | 'add' | 'edit'>('view');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const dateString = format(currentDate, 'yyyy-MM-dd');

  // Load todos for current date
  const loadTodos = useCallback(async () => {
    try {
      const todosForDate = await window.electronAPI.getTodos(dateString);
      setTodos(todosForDate);
    } catch (error) {
      console.error('Failed to load todos:', error);
    }
  }, [dateString]);

  // Save todos
  const saveTodos = useCallback(async (todosToSave: Todo[]) => {
    try {
      await window.electronAPI.saveTodos(dateString, todosToSave);
    } catch (error) {
      console.error('Failed to save todos:', error);
    }
  }, [dateString]);

  // Load available dates
  const loadAvailableDates = useCallback(async () => {
    try {
      const dates = await window.electronAPI.getAllDates();
      setAvailableDates(dates);
    } catch (error) {
      console.error('Failed to load dates:', error);
    }
  }, []);

  useEffect(() => {
    loadTodos();
    loadAvailableDates();
  }, [loadTodos, loadAvailableDates]);

  useEffect(() => {
    const handleWindowShown = () => {
      setIsVisible(true);
      setMode('view');
      setSelectedIndex(0);
      setInput('');
      setEditingId(null);
    };

    const handleWindowHidden = () => {
      setIsVisible(false);
    };

    window.electronAPI.onWindowShown(handleWindowShown);
    window.electronAPI.onWindowHidden(handleWindowHidden);

    return () => {
      window.electronAPI.removeAllListeners('window-shown');
      window.electronAPI.removeAllListeners('window-hidden');
    };
  }, []);

  useEffect(() => {
    if (mode === 'add' || mode === 'edit') {
      inputRef.current?.focus();
    }
  }, [mode]);

  const addTodo = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    const newTodo: Todo = {
      id: `${Date.now()}-${Math.random()}`,
      text: text.trim(),
      completed: false,
      createdAt: dateString,
    };
    
    const updatedTodos = [...todos, newTodo];
    setTodos(updatedTodos);
    await saveTodos(updatedTodos);
    setInput('');
    setMode('view');
    setSelectedIndex(updatedTodos.length - 1);
  }, [todos, dateString, saveTodos]);

  const toggleTodo = useCallback(async (id: string) => {
    const updatedTodos = todos.map(todo =>
      todo.id === id
        ? {
            ...todo,
            completed: !todo.completed,
            completedAt: !todo.completed ? new Date().toISOString() : undefined
          }
        : todo
    );
    setTodos(updatedTodos);
    await saveTodos(updatedTodos);
  }, [todos, saveTodos]);

  const deleteTodo = useCallback(async (id: string) => {
    const updatedTodos = todos.filter(todo => todo.id !== id);
    setTodos(updatedTodos);
    await saveTodos(updatedTodos);
    setSelectedIndex(Math.max(0, Math.min(selectedIndex, updatedTodos.length - 1)));
  }, [todos, saveTodos, selectedIndex]);

  const editTodo = useCallback(async (id: string, newText: string) => {
    if (!newText.trim()) {
      await deleteTodo(id);
      return;
    }
    
    const updatedTodos = todos.map(todo =>
      todo.id === id ? { ...todo, text: newText.trim() } : todo
    );
    setTodos(updatedTodos);
    await saveTodos(updatedTodos);
    setMode('view');
    setEditingId(null);
    setInput('');
  }, [todos, saveTodos, deleteTodo]);

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
          setSelectedIndex(prev => Math.max(0, prev - 1));
        }
        break;
        
      case 'ArrowDown':
        e.preventDefault();
        if (mode === 'view' && todos.length > 0) {
          setSelectedIndex(prev => Math.min(todos.length - 1, prev + 1));
        }
        break;
        
      case 'ArrowLeft':
        e.preventDefault();
        if (mode === 'view') {
          setCurrentDate(prev => subDays(prev, 1));
        }
        break;
        
      case 'ArrowRight':
        e.preventDefault();
        if (mode === 'view') {
          setCurrentDate(prev => addDays(prev, 1));
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
        if (mode === 'view' && todos.length > 0 && (e.key === 'Delete' || (e.key === 'Backspace' && e.metaKey))) {
          deleteTodo(todos[selectedIndex].id);
        }
        break;
        
      case 't':
        if (mode === 'view') {
          e.preventDefault();
          setCurrentDate(new Date());
        }
        break;
    }
  }, [isVisible, mode, input, todos, selectedIndex, editingId, addTodo, editTodo, toggleTodo, deleteTodo]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const getDateDisplay = () => {
    if (isToday(currentDate)) return 'Today';
    if (isYesterday(currentDate)) return 'Yesterday';
    return format(currentDate, 'EEEE, MMM d');
  };

  const getDisplayTodos = () => {
    return todos.sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  };

  const displayTodos = getDisplayTodos();
  const completedCount = todos.filter(t => t.completed).length;

  return (
    <div className="app" ref={containerRef}>
      <motion.div
        className="window"
        initial={{ opacity: 0, scale: 0.9, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <div className="header">
          <div className="date-nav">
            <span className="nav-hint">← →</span>
            <h1 className="date-title">{getDateDisplay()}</h1>
            <div className="stats">
              {todos.length > 0 && (
                <span className="todo-count">
                  {completedCount}/{todos.length}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="content">
          <AnimatePresence mode="wait">
            {mode === 'add' && (
              <motion.div
                key="add-input"
                className="input-container"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Add a new todo..."
                  className="todo-input"
                />
              </motion.div>
            )}

            {mode === 'edit' && (
              <motion.div
                key="edit-input"
                className="input-container"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="todo-input"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="todos-container">
            <AnimatePresence>
              {displayTodos.map((todo, index) => (
                <motion.div
                  key={todo.id}
                  className={`todo-item ${todo.completed ? 'completed' : ''} ${
                    mode === 'view' && index === selectedIndex ? 'selected' : ''
                  }`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  layout
                >
                  <div className="todo-checkbox">
                    {todo.completed ? '✓' : '○'}
                  </div>
                  <span className="todo-text">{todo.text}</span>
                </motion.div>
              ))}
            </AnimatePresence>

            {displayTodos.length === 0 && (
              <motion.div
                className="empty-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <p>No todos for {getDateDisplay().toLowerCase()}</p>
                <p className="hint">Press 'n' to add a new todo</p>
              </motion.div>
            )}
          </div>
        </div>

        <div className="footer">
          <div className="shortcuts">
            {mode === 'view' ? (
              <>
                <span><kbd>n</kbd> new</span>
                <span><kbd>e</kbd> edit</span>
                <span><kbd>⌫</kbd> delete</span>
                <span><kbd>t</kbd> today</span>
              </>
            ) : (
              <>
                <span><kbd>Enter</kbd> save</span>
                <span><kbd>Esc</kbd> cancel</span>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default App;

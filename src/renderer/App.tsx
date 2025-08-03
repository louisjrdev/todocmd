import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTodoStore } from './store/todoStore';
import { usePreferencesStore } from './store/preferencesStore';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import TodoHeader from './components/TodoHeader';
import TodoFooter from './components/TodoFooter';
import TodoInput from './components/TodoInput';
import TodoList from './components/TodoList';
import PreferencesModal from './components/PreferencesModal';
import './App.css';

const App: React.FC = () => {
  const {
    todos,
    currentDate,
    input,
    mode,
    appVersion,
    selectedIndex,
    loadTodos,
    loadAvailableDates,
    loadAppVersion,
    setIsVisible,
    setCurrentDate,
    setMode,
    setSelectedIndex,
    setInput,
    setEditingId,
    resetSelectedIndex,
    setUpdateStatus,
    setupRolloverListener,
  } = useTodoStore();
  
  const { openPreferences, loadSettings } = usePreferencesStore();
  
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const todosContainerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useKeyboardNavigation();

  // Load initial data and setup window event listeners
  useEffect(() => {
    loadAvailableDates(); 
    loadAppVersion();
    loadSettings(); // Load preferences settings on startup
    setupRolloverListener(); // Setup listener for automatic todo rollover
    
    // Set up the global update status callback
    (window as any).updateStatusCallback = (status: 'checking' | 'available' | 'not-available' | 'error') => {
      setUpdateStatus(status);
      
      // Auto-reset status after a delay (except for 'available' which should persist)
      if (status !== 'available') {
        setTimeout(() => {
          setUpdateStatus('idle');
        }, status === 'checking' ? 0 : 3000); // Don't auto-clear checking, clear others after 3s
      }
    };
  }, [loadAvailableDates, loadAppVersion, loadSettings, setupRolloverListener, setUpdateStatus]);

  // Load todos whenever the current date changes
  useEffect(() => {
    loadTodos();
    setSelectedIndex(0);
  }, [currentDate, loadTodos, setSelectedIndex]);

  // Reset selectedIndex and scroll to top when currentDate changes
  useEffect(() => {
    // Scroll to the top of the todos container when date changes
    // Add a small delay to ensure framer-motion animations have completed
    const scrollTimeout = setTimeout(() => {
      if (todosContainerRef.current) {
        todosContainerRef.current.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      }
    }, 200); // Wait 200ms for animations to settle

    return () => clearTimeout(scrollTimeout);
  }, [currentDate]);

  // Window visibility handlers
  useEffect(() => {
    const handleWindowShown = () => {
      setIsVisible(true);
      setMode('view');
      setSelectedIndex(0);
      setInput('');
      setEditingId(null);
      // Always set current date to today when window is shown
      setCurrentDate(new Date());
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
  }, [setIsVisible, setMode, setSelectedIndex, setInput, setEditingId]);

  // Focus input when in add/edit mode
  useEffect(() => {
    if (mode === 'add' || mode === 'edit') {
      inputRef.current?.focus();
    }
  }, [mode]);

  // Ensure selectedIndex stays within bounds
  useEffect(() => {
    resetSelectedIndex();
  }, [todos, resetSelectedIndex]);

  // Setup keyboard event listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="app" ref={containerRef}>
      <motion.div
        className="window"
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
      >
        <TodoHeader />

        <div className="content">
          <AnimatePresence mode="wait">
            {mode === 'add' && (
              <TodoInput
                key="add-input"
                ref={inputRef}
                mode="add"
                value={input}
                onChange={setInput}
                placeholder="Add a new todo..."
              />
            )}

            {mode === 'edit' && (
              <TodoInput
                key="edit-input"
                ref={inputRef}
                mode="edit"
                value={input}
                onChange={setInput}
                placeholder=""
              />
            )}
          </AnimatePresence>

          <TodoList ref={todosContainerRef} />
        </div>

        <TodoFooter />
      </motion.div>
      
      {/* Preferences Modal */}
      <PreferencesModal />
    </div>
  );
};

export default App;

import React, { useEffect } from 'react';
import { usePreferencesStore } from '../store/preferencesStore';
import { motion, AnimatePresence } from 'framer-motion';

const PreferencesModal: React.FC = () => {
  const { 
    isOpen, 
    activeTab, 
    closePreferences, 
    setActiveTab,
    loadSettings 
  } = usePreferencesStore();

  // Load settings when modal opens
  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen, loadSettings]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closePreferences();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, closePreferences]);

  const tabs = [
    { id: 'keybindings', label: 'Keybindings' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'behavior', label: 'Behavior' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="preferences-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={closePreferences}
        >
          <motion.div
            className="preferences-modal"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="preferences-header">
              <h2>Preferences</h2>
              <button 
                className="close-button"
                onClick={closePreferences}
                title="Close (Esc)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            
            <div className="preferences-content">
              <div className="preferences-sidebar">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              
              <div className="preferences-panel">
                {activeTab === 'keybindings' && <KeybindingsPanel />}
                {activeTab === 'appearance' && <ComingSoonPanel title="Appearance" />}
                {activeTab === 'behavior' && <ComingSoonPanel title="Behavior" />}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const KeybindingsPanel: React.FC = () => {
  const { 
    settings, 
    isRecording, 
    updateSetting, 
    startRecording, 
    stopRecording, 
    validateShortcut,
    resetToDefaults 
  } = usePreferencesStore();

  const [platform, setPlatform] = React.useState<string>('');

  React.useEffect(() => {
    // Get platform information from main process
    (window.electronAPI as any).platform().then((p: string) => {
      setPlatform(p);
    });
  }, []);

  const handleShortcutClick = (path: string) => {
    if (isRecording === path) {
      stopRecording();
    } else {
      startRecording(path);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, path: string) => {
    if (isRecording !== path) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Build shortcut string
    const modifiers = [];
    if (e.ctrlKey) modifiers.push(platform === 'darwin' ? 'Ctrl' : 'Ctrl');
    if (e.metaKey) modifiers.push('Cmd');
    if (e.altKey) modifiers.push(platform === 'darwin' ? 'Option' : 'Alt');
    if (e.shiftKey) modifiers.push('Shift');
    
    // Use e.code for the physical key, but handle special cases with e.key
    let key = e.key;
    
    // Handle special keys using e.key
    if (key === ' ') key = 'Space';
    if (key === 'Escape') {
      stopRecording();
      return;
    }
    if (key === 'Backspace' || key === 'Delete') {
      updateSetting(path, '');
      stopRecording();
      return;
    }
    
    // Don't record modifier keys alone
    if (['Control', 'Meta', 'Alt', 'Shift'].includes(key)) return;
    
    // For letter keys and some symbols, use e.code to avoid Alt+key character issues
    if (e.code.startsWith('Key') || e.code.startsWith('Digit')) {
      // e.code is like 'KeyA', 'KeyO', 'Digit1' - extract the letter/number
      key = e.code.replace('Key', '').replace('Digit', '');
    } else if (e.code.startsWith('Arrow')) {
      // Handle arrow keys
      key = e.code; // ArrowLeft, ArrowRight, etc.
    } else if (['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].includes(e.code)) {
      // Handle function keys
      key = e.code;
    } else {
      // For other keys, keep using e.key but be aware of potential issues
      key = e.key;
    }
    
    const shortcut = [...modifiers, key].join('+');
    
    // Validate shortcut
    const validation = validateShortcut(shortcut, path);
    if (!validation.isValid && validation.conflict) {
      // Show conflict warning but still allow assignment
      console.warn(`Shortcut conflict: ${validation.conflict}`);
    }
    
    updateSetting(path, shortcut);
    stopRecording();
  };

  const getShortcutDisplay = (path: string) => {
    const parts = path.split('.');
    let value = settings as any;
    for (const part of parts) {
      value = value?.[part];
    }
    return value || '';
  };

  const ShortcutInput: React.FC<{ 
    label: string; 
    path: string; 
    defaultValue?: string;
  }> = ({ label, path, defaultValue }) => {
    const isCurrentlyRecording = isRecording === path;
    const currentValue = getShortcutDisplay(path);
    const inputRef = React.useRef<HTMLDivElement>(null);
    
    // Focus the element when recording starts
    React.useEffect(() => {
      if (isCurrentlyRecording && inputRef.current) {
        inputRef.current.focus();
      }
    }, [isCurrentlyRecording]);
    
    const handleClick = () => {
      handleShortcutClick(path);
      // Focus the element immediately after click
      if (inputRef.current) {
        inputRef.current.focus();
      }
    };
    
    return (
      <div className="setting-item">
        <label>{label}</label>
        <div 
          ref={inputRef}
          className={`shortcut-input ${isCurrentlyRecording ? 'recording' : ''} ${!currentValue ? 'empty' : ''}`}
          onClick={handleClick}
          onKeyDown={(e) => handleKeyDown(e, path)}
          tabIndex={0}
          title={isCurrentlyRecording ? 'Press keys to record shortcut, Esc to cancel' : 'Click to change shortcut'}
        >
          {isCurrentlyRecording ? (
            <span className="recording-text">Recording...</span>
          ) : (
            <kbd>{currentValue || 'None'}</kbd>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="panel-content">
      <h3>Keyboard Shortcuts</h3>
      <p className="panel-description">
        Customize keyboard shortcuts for TodoCmd. Click on a shortcut to change it.
        Press Backspace or Delete while recording to clear a shortcut.
      </p>
      
      <div className="setting-section">
        <h4>Global Shortcuts</h4>
        <ShortcutInput 
          label="Toggle App"
          path="keybindings.global.toggleApp"
          defaultValue="Alt+T"
        />
      </div>
      
      <div className="setting-section">
        <h4>Navigation</h4>
        <ShortcutInput 
          label="New Todo"
          path="keybindings.navigation.newTodo"
          defaultValue="n"
        />
        <ShortcutInput 
          label="Edit Mode"
          path="keybindings.navigation.editMode"
          defaultValue="e"
        />
        <ShortcutInput 
          label="Delete Selected"
          path="keybindings.navigation.deleteSelected"
          defaultValue="Delete"
        />
        <ShortcutInput 
          label="Today View"
          path="keybindings.navigation.todayView"
          defaultValue="t"
        />
        <ShortcutInput 
          label="Check Updates"
          path="keybindings.navigation.checkUpdates"
          defaultValue="u"
        />
        <ShortcutInput 
          label="Previous Day"
          path="keybindings.navigation.previousDay"
          defaultValue="ArrowLeft"
        />
        <ShortcutInput 
          label="Next Day"
          path="keybindings.navigation.nextDay"
          defaultValue="ArrowRight"
        />
      </div>
      
      <div className="setting-section">
        <h4>System</h4>
        <ShortcutInput 
          label="Preferences"
          path="keybindings.system.preferences"
          defaultValue={platform === 'darwin' ? 'Cmd+,' : 'Ctrl+,'}
        />
        <ShortcutInput 
          label="Toggle DevTools"
          path="keybindings.system.devTools"
          defaultValue={platform === 'darwin' ? 'Cmd+Option+I' : 'F12'}
        />
      </div>
      
      <div className="setting-actions">
        <button 
          className="reset-button"
          onClick={resetToDefaults}
          title="Reset all shortcuts to default values"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
};

const ComingSoonPanel: React.FC<{ title: string }> = ({ title }) => {
  return (
    <div className="panel-content">
      <h3>{title}</h3>
      <div className="coming-soon">
        <p>🚧 Coming soon!</p>
        <p className="coming-soon-text">
          {title} settings will be available in a future update.
        </p>
      </div>
    </div>
  );
};

export default PreferencesModal;

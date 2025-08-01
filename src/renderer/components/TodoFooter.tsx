import React from 'react';
import { Settings } from 'lucide-react';
import { useTodoStore } from '../store/todoStore';
import { usePreferencesStore } from '../store/preferencesStore';

const TodoFooter: React.FC = () => {
  const { mode, appVersion, updateStatus } = useTodoStore();
  const { openPreferences, settings } = usePreferencesStore();

  const getUpdateStatusIcon = () => {
    switch (updateStatus) {
      case 'checking':
        return (
          <svg width="8" height="8" className="update-spinner">
            <circle cx="4" cy="4" r="3" fill="#6b7280" fillOpacity="0.3" className="background-circle"/>
            <circle cx="4" cy="4" r="2" fill="#6b7280" className="checking-circle"/>
          </svg>
        );
      case 'available':
        return (
          <svg width="8" height="8" className="update-available">
            <circle cx="4" cy="4" r="3" fill="#3b82f6" fillOpacity="0.3" className="background-circle"/>
            <circle cx="4" cy="4" r="2" fill="#3b82f6" className="available-circle"/>
          </svg>
        );
      case 'not-available':
        return (
          <svg width="8" height="8" className="update-success">
            <circle cx="4" cy="4" r="3" fill="#22c55e" fillOpacity="0.3" className="background-circle"/>
            <circle cx="4" cy="4" r="2" fill="#22c55e" className="success-circle"/>
          </svg>
        );
      case 'error':
        return (
          <svg width="8" height="8" className="update-error">
            <circle cx="4" cy="4" r="3" fill="#ef4444" fillOpacity="0.3" className="background-circle"/>
            <circle cx="4" cy="4" r="2" fill="#ef4444" className="error-circle"/>
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="footer">
      <div className="footer-left">
        <button 
          className="settings-button"
          onClick={openPreferences}
          title="Preferences (Ctrl+,)"
        >
          <Settings size={12} />
        </button>
      </div>
      <div className="shortcuts">
        {mode === 'view' ? (
          <>
            <span><kbd>{settings.keybindings.navigation.newTodo}</kbd> new</span>
            <span><kbd>{settings.keybindings.navigation.editMode}</kbd> edit</span>
            <span><kbd>{settings.keybindings.navigation.deleteSelected}</kbd> delete</span>
            <span><kbd>{settings.keybindings.navigation.todayView}</kbd> today</span>
            <span><kbd>{settings.keybindings.navigation.checkUpdates}</kbd> update</span>
          </>
        ) : (
          <>
            <span><kbd>Enter</kbd> save</span>
            <span><kbd>Esc</kbd> cancel</span>
          </>
        )}
      </div>
      {appVersion && (
        <div className="version-info">
          <div className="version-display">
            <span>v{appVersion}</span>
            {updateStatus !== 'idle' && getUpdateStatusIcon()}
          </div>
        </div>
      )}
    </div>
  );
};

export default TodoFooter;

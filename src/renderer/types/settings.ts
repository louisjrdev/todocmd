// Settings type definitions
export interface AppSettings {
  keybindings: {
    global: {
      toggleApp: string;
    };
    navigation: {
      newTodo: string;
      editMode: string;
      deleteSelected: string;
      todayView: string;
      checkUpdates: string;
      previousDay: string;
      nextDay: string;
      // Todo status shortcuts
      markImportant: string;
      markInProgress: string;
      markOnHold: string;
      markCompleted: string;
      markCancelled: string;
    };
    system: {
      toggleDevTools: string;
    };
  };
  appearance: {
    // Future settings
  };
  behavior: {
    // Future settings
  };
}

export interface PreferencesState {
  isOpen: boolean;
  activeTab: string;
  settings: AppSettings;
}

// Default settings - using Ctrl as default, will be updated by preferences store
export const defaultSettings: AppSettings = {
  keybindings: {
    global: {
      toggleApp: "Alt+T",
    },
    navigation: {
      newTodo: "n",
      editMode: "e", 
      deleteSelected: "Delete",
      todayView: "t",
      checkUpdates: "u",
      previousDay: "ArrowLeft",
      nextDay: "ArrowRight",
      // Todo status shortcuts - will be updated to platform-specific by preferences store
      markImportant: "Ctrl+I",
      markInProgress: "Ctrl+P",
      markOnHold: "Ctrl+H",
      markCompleted: "Ctrl+C",
      markCancelled: "Ctrl+X",
    },
    system: {
      toggleDevTools: "F12",
    },
  },
  appearance: {},
  behavior: {},
};

// Helper function to get platform-specific defaults
export const getPlatformSpecificDefaults = (platform: string) => {
  const isMac = platform === 'darwin';
  const modifierKey = isMac ? 'Cmd' : 'Ctrl';
  
  return {
    markImportant: `${modifierKey}+I`,
    markInProgress: `${modifierKey}+P`,
    markOnHold: `${modifierKey}+H`,
    markCompleted: `${modifierKey}+C`,
    markCancelled: `${modifierKey}+X`,
  };
};

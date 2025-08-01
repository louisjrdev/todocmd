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

// Default settings
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
    },
    system: {
      toggleDevTools: "F12", // Will be platform-specific when loaded from settings store
    },
  },
  appearance: {},
  behavior: {},
};

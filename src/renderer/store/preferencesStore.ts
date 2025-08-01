import { create } from 'zustand';
import { AppSettings, defaultSettings } from '../types/settings';

interface PreferencesStore {
  // State
  isOpen: boolean;
  activeTab: string;
  settings: AppSettings;
  isRecording: string | null; // Which shortcut is being recorded
  
  // Actions
  openPreferences: () => void;
  closePreferences: () => void;
  setActiveTab: (tab: string) => void;
  updateSetting: (path: string, value: string) => void;
  resetToDefaults: () => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  startRecording: (path: string) => void;
  stopRecording: () => void;
  validateShortcut: (shortcut: string, excludePath?: string) => { isValid: boolean; conflict?: string };
}

export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  // Initial state
  isOpen: false,
  activeTab: 'keybindings',
  settings: defaultSettings,
  isRecording: null,
  
  // Actions
  openPreferences: () => {
    set({ isOpen: true });
    // Load settings when opening preferences
    get().loadSettings();
  },
  
  closePreferences: () => set({ 
    isOpen: false, 
    isRecording: null 
  }),
  
  setActiveTab: (activeTab) => set({ activeTab }),
  
  updateSetting: (path, value) => {
    const { settings } = get();
    const newSettings = { ...settings };
    
    // Navigate to the nested property and update it
    const pathParts = path.split('.');
    let current: any = newSettings;
    
    for (let i = 0; i < pathParts.length - 1; i++) {
      current = current[pathParts[i]];
    }
    
    current[pathParts[pathParts.length - 1]] = value;
    
    set({ settings: newSettings });
    
    // Auto-save after update
    get().saveSettings();
  },
  
  resetToDefaults: () => {
    set({ settings: { ...defaultSettings } });
    get().saveSettings();
  },
  
  loadSettings: async () => {
    try {
      const loadedSettings = await (window.electronAPI as any).getSettings();
      if (loadedSettings) {
        // Merge with defaults to ensure all properties exist
        const mergedSettings = {
          ...defaultSettings,
          ...loadedSettings,
          keybindings: {
            ...defaultSettings.keybindings,
            ...loadedSettings.keybindings,
            global: {
              ...defaultSettings.keybindings.global,
              ...loadedSettings.keybindings?.global,
            },
            navigation: {
              ...defaultSettings.keybindings.navigation,
              ...loadedSettings.keybindings?.navigation,
            },
            system: {
              ...defaultSettings.keybindings.system,
              ...loadedSettings.keybindings?.system,
            },
          },
        };
        set({ settings: mergedSettings });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },
  
  saveSettings: async () => {
    try {
      await (window.electronAPI as any).saveSettings(get().settings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  },
  
  startRecording: (path) => set({ isRecording: path }),
  
  stopRecording: () => set({ isRecording: null }),
  
  validateShortcut: (shortcut, excludePath) => {
    const { settings } = get();
    
    // Basic validation
    if (!shortcut || shortcut.trim() === '') {
      return { isValid: false };
    }
    
    // Check for conflicts
    const checkObject = (obj: any, currentPath = ''): string | null => {
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = currentPath ? `${currentPath}.${key}` : key;
        
        if (typeof value === 'string') {
          if (value === shortcut && fullPath !== excludePath) {
            return fullPath;
          }
        } else if (typeof value === 'object' && value !== null) {
          const conflict = checkObject(value, fullPath);
          if (conflict) return conflict;
        }
      }
      return null;
    };
    
    const conflict = checkObject(settings.keybindings);
    
    return {
      isValid: !conflict,
      conflict: conflict || undefined,
    };
  },
}));

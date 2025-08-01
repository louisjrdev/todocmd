const { contextBridge, ipcRenderer } = require('electron');

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  completedAt?: string;
}

const electronAPI = {
  getTodos: (date: string): Promise<Todo[]> => ipcRenderer.invoke('get-todos', date),
  saveTodos: (date: string, todos: Todo[]): Promise<boolean> => ipcRenderer.invoke('save-todos', date, todos),
  getAllDates: (): Promise<string[]> => ipcRenderer.invoke('get-all-dates'),
  hideWindow: (): Promise<void> => ipcRenderer.invoke('hide-window'),
  onWindowShown: (callback: () => void) => ipcRenderer.on('window-shown', callback),
  onWindowHidden: (callback: () => void) => ipcRenderer.on('window-hidden', callback),
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
  // Auto-updater APIs
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('check-for-updates'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
  // Settings APIs
  getSettings: (): Promise<any> => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: any): Promise<boolean> => ipcRenderer.invoke('save-settings', settings),
  getSetting: (key: string): Promise<any> => ipcRenderer.invoke('get-setting', key),
  setSetting: (key: string, value: any): Promise<boolean> => ipcRenderer.invoke('set-setting', key, value),
  resetSettings: (): Promise<any> => ipcRenderer.invoke('reset-settings'),
  // Platform information
  platform: (): Promise<string> => ipcRenderer.invoke('get-platform'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;

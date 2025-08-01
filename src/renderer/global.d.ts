import { ElectronAPI } from '../preload';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    updateStatusCallback?: (status: 'checking' | 'available' | 'not-available' | 'error') => void;
  }
}

export {};

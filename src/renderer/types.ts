declare global {
  interface Window {
    electronAPI: {
      getTodos: (date: string) => Promise<Todo[]>;
      saveTodos: (date: string, todos: Todo[]) => Promise<boolean>;
      getAllDates: () => Promise<string[]>;
      hideWindow: () => Promise<void>;
      onWindowShown: (callback: () => void) => void;
      onWindowHidden: (callback: () => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  completedAt?: string;
}

export {};

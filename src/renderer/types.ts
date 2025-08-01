export type TodoStatus = 'pending' | 'important' | 'in-progress' | 'on-hold' | 'completed' | 'cancelled';

export interface Todo {
  id: string;
  text: string;
  completed: boolean; // Keep for backward compatibility
  status: TodoStatus;
  createdAt: string;
  completedAt?: string;
}

export {};

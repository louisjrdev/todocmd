import React from 'react';
import { motion } from 'framer-motion';
import { 
  Circle, 
  CheckCircle, 
  AlertCircle, 
  Hourglass, 
  Pause, 
  X 
} from 'lucide-react';
import { Todo, TodoStatus } from '../types';

interface TodoItemProps {
  todo: Todo;
  index: number;
  isSelected: boolean;
  mode: 'view' | 'add' | 'edit';
}

const TodoItem: React.FC<TodoItemProps> = ({
  todo,
  index,
  isSelected,
  mode,
}) => {
  const getStatusIcon = (status: TodoStatus) => {
    const iconProps = { size: 16, strokeWidth: 2 };
    
    switch (status) {
      case 'completed':
        return <CheckCircle {...iconProps} className="status-icon completed" />;
      case 'important':
        return <AlertCircle {...iconProps} className="status-icon important" />;
      case 'in-progress':
        return <Hourglass {...iconProps} className="status-icon in-progress" />;
      case 'on-hold':
        return <Pause {...iconProps} className="status-icon on-hold" />;
      case 'cancelled':
        return <X {...iconProps} className="status-icon cancelled" />;
      case 'pending':
      default:
        return <Circle {...iconProps} className="status-icon pending" />;
    }
  };

  const getStatusClass = (status: TodoStatus) => {
    // Map status to CSS classes
    switch (status) {
      case 'completed':
        return 'completed';
      case 'important':
        return 'important';
      case 'in-progress':
        return 'in-progress';
      case 'on-hold':
        return 'on-hold';
      case 'cancelled':
        return 'cancelled';
      case 'pending':
      default:
        return 'pending';
    }
  };

  // Use status if available, fallback to completed for backward compatibility
  const currentStatus: TodoStatus = todo.status || (todo.completed ? 'completed' : 'pending');

  return (
    <motion.div
      className={`todo-item ${getStatusClass(currentStatus)} ${
        mode === 'view' && isSelected ? 'selected' : ''
      }`}
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 5 }}
      transition={{ duration: 0.1, ease: "easeOut" }}
    >
      <div className="todo-checkbox">
        {getStatusIcon(currentStatus)}
      </div>
      <span className="todo-text">{todo.text}</span>
    </motion.div>
  );
};

export default TodoItem;

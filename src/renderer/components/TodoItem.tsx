import React from 'react';
import { motion } from 'framer-motion';
import { Todo } from '../types';

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
  return (
    <motion.div
      className={`todo-item ${todo.completed ? 'completed' : ''} ${
        mode === 'view' && isSelected ? 'selected' : ''
      }`}
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 5 }}
      transition={{ duration: 0.1, ease: "easeOut" }}
    >
      <div className="todo-checkbox">
        {todo.completed ? '✓' : '○'}
      </div>
      <span className="todo-text">{todo.text}</span>
    </motion.div>
  );
};

export default TodoItem;

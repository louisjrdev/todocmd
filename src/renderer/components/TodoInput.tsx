import React, { forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TodoInputProps {
  mode: 'add' | 'edit';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const TodoInput = forwardRef<HTMLInputElement, TodoInputProps>(
  ({ mode, value, onChange, placeholder=  "Add a new todo..." }, ref) => {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={`${mode}-input`}
          className="input-container"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.15 }}
        >
          <input
            ref={ref}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="todo-input"
          />
        </motion.div>
      </AnimatePresence>
    );
  }
);

TodoInput.displayName = 'TodoInput';

export default TodoInput;

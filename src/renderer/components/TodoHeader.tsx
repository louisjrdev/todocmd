import React from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { useTodoStore, useCompletedCount } from '../store/todoStore';

const TodoHeader: React.FC = () => {
  const { currentDate, todos } = useTodoStore();
  const completedCount = useCompletedCount();
  
  const getDateDisplay = () => {
    if (isToday(currentDate)) return 'Today';
    if (isYesterday(currentDate)) return 'Yesterday';
    return format(currentDate, 'EEEE, MMM d');
  };

  return (
    <div className="header">
      <div className="date-nav">
        <span className="nav-hint">← →</span>
        <h1 className="date-title">{getDateDisplay()}</h1>
        <div className="stats">
          {todos.length > 0 && (
            <span className="todo-count">
              {completedCount}/{todos.length}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default TodoHeader;

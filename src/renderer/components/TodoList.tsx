import React, { forwardRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isToday, isYesterday } from 'date-fns';
import { useTodoStore } from '../store/todoStore';
import { usePreferencesStore } from '../store/preferencesStore';
import TodoItem from './TodoItem';

const TodoList = forwardRef<HTMLDivElement>((props, ref) => {
  const { todos, currentDate, selectedIndex, mode } = useTodoStore();
  const { settings } = usePreferencesStore();
  
  // Scroll to top when date changes (with animation delay)
  useEffect(() => {
    const scrollTimeout = setTimeout(() => {
      if (ref && 'current' in ref && ref.current) {
        ref.current.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      }
    }, 300); // Slightly longer delay to ensure all animations are complete

    return () => clearTimeout(scrollTimeout);
  }, [currentDate, ref]);

  useEffect(() => {
    console.log('Selected index changed:', selectedIndex);
    if (!ref || !('current' in ref) || !ref.current) return;
    // get element for selected todo
    const selectedTodoElement = document.querySelector(
      `.todo-item.selected`
    ) as HTMLElement;

    // if it is off screen or partially off screen, scroll it into view
    const isOffScreen =
      selectedTodoElement &&
      (selectedTodoElement.offsetTop < ref.current.scrollTop ||
        selectedTodoElement.offsetTop + selectedTodoElement.offsetHeight >
          ref.current.scrollTop + ref.current.clientHeight);

    if (isOffScreen && selectedTodoElement) {
        console.log('Scrolling selected todo into view');
      // Scroll the selected todo into view
      ref.current.scrollTop = selectedTodoElement.offsetTop - ref.current.clientHeight / 2;
      // Ensure it is centered in the view
      selectedTodoElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'start'
      });
    }
  }, [selectedIndex]);

  const getDateDisplay = () => {
    if (isToday(currentDate)) return 'Today';
    if (isYesterday(currentDate)) return 'Yesterday';
    return format(currentDate, 'EEEE, MMM d');
  };

    return (
      <div className="todos-container" ref={ref}>
        <AnimatePresence>
          {todos.map((todo, index) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              index={index}
              isSelected={index === selectedIndex}
              mode={mode}
            />
          ))}
        </AnimatePresence>

        {todos.length === 0 && (
          <motion.div
            className="empty-state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <p>No todos for {getDateDisplay().toLowerCase()}</p>
            <p className="hint">Press '{settings.keybindings.navigation.newTodo}' to add a new todo</p>
          </motion.div>
        )}
      </div>
    );
  }
);

TodoList.displayName = 'TodoList';

export default TodoList;

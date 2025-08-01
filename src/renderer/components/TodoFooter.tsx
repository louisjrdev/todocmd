import React from 'react';
import { useTodoStore } from '../store/todoStore';

const TodoFooter: React.FC = () => {
  const { mode, appVersion } = useTodoStore();

  return (
    <div className="footer">
      <div className="shortcuts">
        {mode === 'view' ? (
          <>
            <span><kbd>n</kbd> new</span>
            <span><kbd>e</kbd> edit</span>
            <span><kbd>⌫</kbd> delete</span>
            <span><kbd>t</kbd> today</span>
            <span><kbd>u</kbd> update</span>
          </>
        ) : (
          <>
            <span><kbd>Enter</kbd> save</span>
            <span><kbd>Esc</kbd> cancel</span>
          </>
        )}
      </div>
      {appVersion && (
        <div className="version-info">
          <span>v{appVersion}</span>
        </div>
      )}
    </div>
  );
};

export default TodoFooter;

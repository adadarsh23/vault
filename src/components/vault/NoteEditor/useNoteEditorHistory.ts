import { useCallback, useEffect, useRef, useState } from 'react';
import type { HistoryState } from './types';

interface UseNoteEditorHistoryOptions {
  setTitle: (title: string) => void;
  setContent: (content: string) => void;
}

export const useNoteEditorHistory = ({ setTitle, setContent }: UseNoteEditorHistoryOptions) => {
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedoAction = useRef(false);
  const historyIndexRef = useRef(-1);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  const resetHistory = useCallback((initialState: HistoryState) => {
    setHistory([initialState]);
    setHistoryIndex(0);
    historyIndexRef.current = 0;
  }, []);

  const pushToHistory = useCallback((newTitle: string, newContent: string) => {
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }

    setHistory((prevHistory) => {
      const safeIndex = Math.max(0, historyIndexRef.current);
      const sliced = prevHistory.slice(0, safeIndex + 1);
      const last = sliced[sliced.length - 1];
      if (last && last.title === newTitle && last.content === newContent) {
        return prevHistory;
      }

      const updated = [...sliced, { title: newTitle, content: newContent }];
      if (updated.length > 50) updated.shift();
      const nextIndex = updated.length - 1;
      historyIndexRef.current = nextIndex;
      setHistoryIndex(nextIndex);
      return updated;
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      isUndoRedoAction.current = true;
      const prevIndex = historyIndex - 1;
      const state = history[prevIndex];
      setTitle(state.title);
      setContent(state.content);
      setHistoryIndex(prevIndex);
    }
  }, [history, historyIndex, setContent, setTitle]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isUndoRedoAction.current = true;
      const nextIndex = historyIndex + 1;
      const state = history[nextIndex];
      setTitle(state.title);
      setContent(state.content);
      setHistoryIndex(nextIndex);
    }
  }, [history, historyIndex, setContent, setTitle]);

  return {
    history,
    historyIndex,
    resetHistory,
    pushToHistory,
    handleUndo,
    handleRedo,
  };
};

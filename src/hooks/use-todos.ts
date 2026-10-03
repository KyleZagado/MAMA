import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getDatabase } from '../database';
import { getTaskUndo, listTodos, type Todo } from '../database/todos';

export function useTodos(userId: string) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const request = useRef(0);

  const reload = useCallback(async () => {
    const token = ++request.current;
    setIsLoading(true);
    try {
      const db = await getDatabase(userId);
      const [rows, action] = await Promise.all([listTodos(db), getTaskUndo(db)]);
      if (token !== request.current) return;
      setTodos(rows);
      setUndo(action?.label ?? null);
      setError(null);
    } catch (e: unknown) {
      if (token === request.current) setError(e instanceof Error ? e.message : 'Could not load your tasks.');
    } finally {
      if (token === request.current) setIsLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      reload();
      return () => { request.current++; };
    }, [reload]),
  );

  return { todos, error, reload, undo, isLoading };
}

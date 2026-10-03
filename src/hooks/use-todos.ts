import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getDatabase } from '../database';
import { listTodos, type Todo } from '../database/todos';

export function useTodos(userId: string) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const db = await getDatabase(userId);
      setTodos(await listTodos(db));
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load your tasks.');
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { todos, error, reload };
}

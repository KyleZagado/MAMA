import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { TaskForm } from '../screens/task-form';

export default function TaskFormRoute() {
  const { id, date, occurrence, list } = useLocalSearchParams<{ id?: string; date?: string; occurrence?: string; list?: string }>();
  return <AuthGate>{(session) => <TaskForm session={session} taskId={id} initialDate={date} occurrenceDate={occurrence} initialList={list} />}</AuthGate>;
}

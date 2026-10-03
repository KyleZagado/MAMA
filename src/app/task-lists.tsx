import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { TaskLists } from '../screens/task-lists';

export default function TaskListsRoute() {
  return <AuthGate>{(session) => <TaskLists session={session} />}</AuthGate>;
}
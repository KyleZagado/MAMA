import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { TaskManager } from '../screens/task-manager';

export default function TasksRoute() {
  return <AuthGate>{(session) => <TaskManager session={session} />}</AuthGate>;
}

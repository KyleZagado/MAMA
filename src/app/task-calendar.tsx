import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { TaskCalendar } from '../screens/task-calendar';

export default function TaskCalendarRoute() {
  return <AuthGate>{(session) => <TaskCalendar session={session} />}</AuthGate>;
}

import type { Session } from '@supabase/supabase-js';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, ChipRow, formStyles, PrimaryButton } from '../components/form';
import { PickerField } from '../components/picker-field';
import { ScreenHeader } from '../components/screen-header';
import { TaskDragHandle } from '../components/task-drag-handle';
import { lightColors as colors, radius, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import {
  getTaskUndo, listCalendarTodos, listOverdueCalendarTodos, saveCalendarTodo, undoTaskAction,
  type CalendarTodo, type TodoInput,
} from '../database/todos';
import { addDaysToKey, formatTimeKey, fromDateKey, toDateKey } from '../lib/dates';
import {
  calendarRange, clockAt, minutesOf, movedTaskTimes, resizedTaskEnd,
  shiftCalendar, type CalendarView,
} from '../lib/task-calendar';
import type { DropRect } from '../lib/task-drag';

const views: { id: CalendarView; label: string }[] = [
  { id: 'month', label: 'Month' }, { id: 'week', label: 'Week' }, { id: 'day', label: 'Day' },
  { id: 'agenda', label: 'Agenda' }, { id: 'timeline', label: 'Timeline' }, { id: 'year', label: 'Year' },
];
const PX_PER_MINUTE = 1.2;
const colorFor = (task: CalendarTodo) => task.color ??
  (task.priority === 'high' ? '#B3443A' : task.priority === 'medium' ? '#A86A2A' : '#2D5BD0');
type Drag = { task: CalendarTodo; operation: 'move' | 'resize'; startY: number };
type DateTarget = { date: string; rect: DropRect };

export function TaskCalendar({ session }: { session: Session }) {
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [view, setView] = useState<CalendarView>('month');
  const [tasks, setTasks] = useState<CalendarTodo[]>([]);
  const [overdue, setOverdue] = useState<CalendarTodo[]>([]);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showRecurring, setShowRecurring] = useState(true);
  const [showOverdue, setShowOverdue] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dragLabel, setDragLabel] = useState('');
  const [resizeEnd, setResizeEnd] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [position] = useState(() => new Animated.ValueXY());
  const active = useRef<Drag | null>(null);
  const pending = useRef(false);
  const generation = useRef(0);
  const dateViews = useRef(new Map<string, View>());
  const dateTargets = useRef<DateTarget[]>([]);
  const timeline = useRef<View>(null);
  const timelineRect = useRef<DropRect | null>(null);
  const root = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const today = toDateKey(new Date());
  const range = useMemo(() => calendarRange(date, view), [date, view]);
  const accepted = useCallback((task: CalendarTodo) =>
    (showCompleted || task.status !== 'done') && (showRecurring || !task.repeating),
  [showCompleted, showRecurring]);
  const visible = useMemo(() => tasks.filter(accepted), [tasks, accepted]);
  const selectedTasks = visible.filter((task) => task.due_date === date);
  const counts = useMemo(() => {
    const result = new Map<string, CalendarTodo[]>();
    for (const task of visible) result.set(task.due_date, [...(result.get(task.due_date) ?? []), task]);
    return result;
  }, [visible]);
  const [bodyWidth, setBodyWidth] = useState(300);

  const reload = useCallback(async () => {
    const token = ++generation.current;
    setIsLoading(true);
    setError(null);
    try {
      const db = await getDatabase(session.user.id);
      const [rows, past, lastUndo] = await Promise.all([
        listCalendarTodos(db, range.from, range.through),
        listOverdueCalendarTodos(db, today),
        getTaskUndo(db),
      ]);
      if (token !== generation.current) return;
      setTasks(rows);
      setOverdue(past);
      setUndo(lastUndo?.label ?? null);
    } catch (e: unknown) {
      if (token === generation.current) setError(e instanceof Error ? e.message : 'Could not load the task calendar.');
    } finally {
      if (token === generation.current) setIsLoading(false);
    }
  }, [session.user.id, range, today]);

  useFocusEffect(useCallback(() => {
    void reload();
    return () => { generation.current++; };
  }, [reload]));

  async function run(action: (db: Awaited<ReturnType<typeof getDatabase>>) => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await action(await getDatabase(session.user.id));
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not update the calendar task.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function patch(task: CalendarTodo, input: Partial<TodoInput>) {
    void run((db) => saveCalendarTodo(db, task, input));
  }

  function openTask(task: CalendarTodo) {
    if (pending.current || active.current) return;
    router.push({ pathname: '/task-form', params: task.virtual && task.series_id && task.occurrence_date
      ? { id: task.series_id, occurrence: task.occurrence_date } : { id: task.id } });
  }

  function cancelDrag() {
    active.current = null;
    setDrag(null);
    setHoverDate(null);
    setResizeEnd(null);
    dateTargets.current = [];
    timelineRect.current = null;
  }

  function beginDrag(task: CalendarTodo, operation: Drag['operation'], x: number, y: number) {
    if (pending.current || isLoading) return;
    swipeStart.current = null;
    const next = { task, operation, startY: y };
    active.current = next;
    setDrag(next);
    setDragLabel(operation === 'resize' ? 'Resize duration (15 min steps)' : task.title);
    dateTargets.current = [];
    for (const [key, node] of dateViews.current) node.measureInWindow((rx, ry, width, height) => {
      if (active.current === next) dateTargets.current.push({ date: key, rect: { x: rx, y: ry, width, height } });
    });
    timeline.current?.measureInWindow((rx, ry, width, height) => {
      if (active.current === next) timelineRect.current = { x: rx, y: ry, width, height };
    });
    position.setValue({ x: x - origin.current.x - 110, y: y - origin.current.y - 50 });
  }

  function timeAtPoint(x: number, y: number) {
    const rect = timelineRect.current;
    if (!rect || x < rect.x || x > rect.x + rect.width || y < rect.y || y > rect.y + rect.height) return null;
    return clockAt(Math.min(1425, Math.max(0, Math.round((y - rect.y) / PX_PER_MINUTE / 15) * 15)));
  }

  function dateAtPoint(x: number, y: number) {
    return dateTargets.current.find(({ rect }) => x >= rect.x && x <= rect.x + rect.width &&
      y >= rect.y && y <= rect.y + rect.height)?.date;
  }

  function moveDrag(x: number, y: number) {
    const current = active.current;
    if (!current) return;
    position.setValue({ x: x - origin.current.x - 110, y: y - origin.current.y - 50 });
    if (current.operation === 'resize' && current.task.start_time) {
      const end = resizedTaskEnd(current.task.start_time, current.task.end_time, y - current.startY, PX_PER_MINUTE);
      setResizeEnd(end);
      setDragLabel(`End ${formatTimeKey(end)}`);
    } else {
      const nextDate = dateAtPoint(x, y);
      const nextTime = timeAtPoint(x, y);
      setHoverDate(nextDate ?? null);
      setDragLabel(nextDate ? `Move to ${nextDate}` : nextTime ? `Start ${formatTimeKey(nextTime)}` : current.task.title);
    }
  }

  function finishDrag(x: number, y: number) {
    const current = active.current;
    const nextDate = dateAtPoint(x, y);
    const nextTime = timeAtPoint(x, y);
    cancelDrag();
    if (!current) return;
    try {
      if (current.operation === 'resize' && current.task.start_time) {
        const end = resizedTaskEnd(current.task.start_time, current.task.end_time, y - current.startY, PX_PER_MINUTE);
        if (end !== current.task.end_time) patch(current.task, { endTime: end,
          estimatedMinutes: minutesOf(end) - minutesOf(current.task.start_time) });
      } else if (nextDate && nextDate !== current.task.due_date) patch(current.task, { dueDate: nextDate });
      else if (nextTime) patch(current.task, { dueDate: date,
        ...movedTaskTimes(current.task.start_time, current.task.end_time, current.task.due_time, nextTime) });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'This task cannot be dropped here.');
    }
  }

  const enabled = !isLoading && !busy && !drag;
  const go = (direction: number) => { if (enabled) setDate(shiftCalendar(date, view, direction)); };

  function taskCard(task: CalendarTodo) {
    const time = task.start_time ?? task.due_time;
    return (
      <View key={task.calendarKey} style={[styles.task, { borderLeftColor: colorFor(task) }]}>
        <Pressable disabled={!enabled} onPress={() => patch(task, { status: task.status === 'done' ? 'todo' : 'done' })}
          style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: task.status === 'done' }} accessibilityLabel={`Complete ${task.title}`}>
          <Text style={styles.heading}>{task.status === 'done' ? '[x]' : '[ ]'}</Text>
        </Pressable>
        <Pressable style={styles.flex} onPress={() => openTask(task)} accessibilityRole="button">
          <Text style={[styles.heading, task.status === 'done' && styles.strike]}>{time ? `${formatTimeKey(time)} - ` : ''}{task.title}</Text>
          <Text style={styles.small}>{task.all_day ? 'All day' : task.end_time ? `Until ${formatTimeKey(task.end_time)}` : 'No end time'}
            {` · ${task.category ?? task.priority}`}{task.repeating ? ' · Repeats' : ''}{task.status === 'in_progress' ? ' · In Progress' : ''}</Text>
        </Pressable>
        {!busy && !isLoading && <TaskDragHandle onStart={(x, y) => beginDrag(task, 'move', x, y)} onMove={moveDrag} onEnd={finishDrag} onCancel={cancelDrag} />}
      </View>
    );
  }

  function dateCell(key: string, compact = false) {
    const entries = counts.get(key) ?? [];
    return <View key={key} collapsable={false} style={[styles.dateCell, compact && styles.weekCell]}
      ref={(node) => { if (node) dateViews.current.set(key, node); else dateViews.current.delete(key); }}>
      <Pressable onPress={() => { if (enabled) setDate(key); }}
        style={[styles.dateButton, key === date && styles.selectedDate, key === today && styles.today, hoverDate === key && styles.drop]}
        accessibilityRole="button" accessibilityLabel={`${key}, ${entries.length} tasks${key === today ? ', today' : ''}`}>
        <Text style={[styles.heading, key === today && styles.todayText]}>{fromDateKey(key).getDate()}</Text>
        <View style={styles.dots}>{entries.slice(0, 4).map((task) => <View key={task.calendarKey} style={[styles.dot, { backgroundColor: colorFor(task) }]} />)}</View>
        {entries.length > 0 && <Text style={styles.small}>{entries.length} {entries.every((task) => task.status === 'done') ? 'done' : 'tasks'}</Text>}
      </Pressable>
    </View>;
  }

  const timed = selectedTasks.filter((task) => !task.all_day && (task.start_time || task.due_time));
  const lanes: { task: CalendarTodo; lane: number; start: number; end: number }[] = [];
  const laneEnds: number[] = [];
  for (const task of timed) {
    const start = minutesOf(task.start_time ?? task.due_time ?? '09:00');
    const end = task.end_time ? minutesOf(task.end_time) : Math.min(1439, start + 30);
    let lane = laneEnds.findIndex((lastEnd) => lastEnd <= start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = Math.max(end, start + 75);
    lanes.push({ task, lane, start, end });
  }
  const timelineWidth = Math.max(bodyWidth, laneEnds.length * 140 + 58);
  const laneWidth = (timelineWidth - 58) / Math.max(1, laneEnds.length);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View ref={root} style={styles.flex} onLayout={() => root.current?.measureInWindow((x, y) => { origin.current = { x, y }; })}>
        <View style={styles.header}>
          <ScreenHeader title="Task Calendar" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}><ChipRow>{views.map((option) =>
            <Chip key={option.id} label={option.label} selected={view === option.id} disabled={!enabled} onPress={() => setView(option.id)} />)}</ChipRow></ScrollView>
          <View style={styles.row}>
            <Chip label="<" selected={false} disabled={!enabled} onPress={() => go(-1)} />
            <PickerField mode="date" value={fromDateKey(date)} onChange={(next) => { if (enabled) setDate(toDateKey(next)); }} />
            <Chip label=">" selected={false} disabled={!enabled} onPress={() => go(1)} />
            <Chip label="Today" selected={date === today} disabled={!enabled} onPress={() => setDate(today)} />
          </View>
          <ChipRow>
            <Chip label="+ Task" selected={false} disabled={!enabled} onPress={() => router.push({ pathname: '/task-form', params: { date } })} />
            <Chip label="Manage" selected={false} disabled={!enabled} onPress={() => router.push('/tasks')} />
            {undo && <Chip label="Undo" selected={false} disabled={!enabled} onPress={() => void run(undoTaskAction)} />}
          </ChipRow>
          {error && <Text style={formStyles.error}>{error}</Text>}
          {error && <PrimaryButton label="Retry" disabled={busy} onPress={() => void reload()} />}
        </View>
        <ScrollView scrollEnabled={!drag} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
          onTouchStart={(event) => { if (!active.current) swipeStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }; }}
          onTouchEnd={(event) => {
            const start = swipeStart.current;
            swipeStart.current = null;
            if (start && !active.current && Math.abs(event.nativeEvent.pageX - start.x) > 80 &&
                Math.abs(event.nativeEvent.pageY - start.y) < 40) go(event.nativeEvent.pageX < start.x ? 1 : -1);
          }}>
          <View style={styles.row}>
            <Text style={styles.small}>Completed</Text><Switch value={showCompleted} onValueChange={setShowCompleted} disabled={!enabled} />
            <Text style={styles.small}>Recurring</Text><Switch value={showRecurring} onValueChange={setShowRecurring} disabled={!enabled} />
            <Text style={styles.small}>Overdue</Text><Switch value={showOverdue} onValueChange={setShowOverdue} disabled={!enabled} />
          </View>
          {isLoading || busy ? <ActivityIndicator color={colors.primary} /> : (
            <>
              <Text style={styles.title}>{fromDateKey(date).toLocaleDateString('en-US',
                view === 'year' ? { year: 'numeric' } : { month: 'long', year: 'numeric', ...(view === 'day' || view === 'timeline' ? { day: 'numeric' } : {}) })}</Text>
              {(view === 'day' || view === 'timeline') && <View style={styles.grid}>
                {Array.from({ length: 7 }, (_, index) => dateCell(addDaysToKey(date, index - 3), true))}
              </View>}
              {(view === 'month' || view === 'week') && (
                <>
                  <View style={styles.weekdays}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}</View>
                  <View style={styles.grid}>{Array.from({ length: view === 'month' ? 42 : 7 }, (_, index) => dateCell(addDaysToKey(range.from, index), view === 'week'))}</View>
                  <Text style={styles.heading}>{date}</Text>
                  {selectedTasks.length ? selectedTasks.map(taskCard) : <Text style={styles.small}>No tasks on this date.</Text>}
                </>
              )}
              {view === 'day' && (selectedTasks.length ? selectedTasks.map(taskCard) : <Text style={styles.small}>No tasks on this date.</Text>)}
              {view === 'agenda' && (
                visible.length ? [...counts].map(([key, items]) => <View key={key} style={styles.stack}>
                  <Pressable onPress={() => { setDate(key); setView('day'); }}><Text style={styles.heading}>{key}{key === today ? ' · Today' : ''}</Text></Pressable>
                  {items.map(taskCard)}
                </View>) : <Text style={styles.small}>No tasks in the next 31 days.</Text>
              )}
              {view === 'year' && <View style={styles.yearGrid}>{Array.from({ length: 12 }, (_, month) => {
                const first = new Date(fromDateKey(date).getFullYear(), month, 1);
                const key = toDateKey(first);
                const daysInMonth = new Date(first.getFullYear(), month + 1, 0).getDate();
                const monthTasks = visible.filter((task) => task.due_date.slice(0, 7) === key.slice(0, 7));
                return <View key={key} style={styles.miniMonth}>
                  <Pressable onPress={() => { setDate(key); setView('month'); }}><Text style={styles.heading}>{first.toLocaleDateString('en-US', { month: 'long' })} · {monthTasks.length}</Text></Pressable>
                  <View style={styles.miniGrid}>{Array.from({ length: first.getDay() }, (_, index) => <View key={`blank-${index}`} style={styles.miniCell} />)}
                    {Array.from({ length: daysInMonth }, (_, index) => {
                      const day = toDateKey(new Date(first.getFullYear(), month, index + 1));
                      const entries = counts.get(day) ?? [];
                      return <Pressable key={day} onPress={() => { setDate(day); setView('day'); }} accessibilityLabel={`${day}, ${entries.length} tasks`}
                        style={[styles.miniCell, day === today && styles.today, entries.length > 0 && styles.selectedDate]}>
                        <Text style={styles.small}>{index + 1}</Text>
                      </Pressable>;
                    })}</View>
                </View>;
              })}</View>}
              {view === 'timeline' && (
                <>
                  <Text style={styles.small}>Drag a task grip to a time (15-minute steps). Drag its resize grip to change the end time. Use the editor for exact times. Scroll first; dragging does not auto-scroll.</Text>
                  {selectedTasks.filter((task) => task.all_day || (!task.start_time && !task.due_time)).map(taskCard)}
                  <View onLayout={(event) => setBodyWidth(event.nativeEvent.layout.width)}>
                  <ScrollView horizontal scrollEnabled={!drag} onScrollBeginDrag={() => { swipeStart.current = null; }}>
                  <View ref={timeline} collapsable={false} style={[styles.timeline, { width: timelineWidth }]}>
                    {Array.from({ length: 24 }, (_, hour) => <View key={hour} style={styles.hour}>
                      <Text style={styles.hourLabel}>{formatTimeKey(clockAt(hour * 60))}</Text>
                    </View>)}
                    {lanes.map(({ task, lane, start, end }) => {
                      const previewEnd = drag?.task.calendarKey === task.calendarKey && resizeEnd ? minutesOf(resizeEnd) : end;
                      return <View key={task.calendarKey} style={[styles.event, {
                        top: start * PX_PER_MINUTE, height: Math.max(90, (previewEnd - start) * PX_PER_MINUTE),
                        left: 58 + lane * laneWidth, width: Math.max(40, laneWidth - 4), borderLeftColor: colorFor(task),
                      }]}>
                        <Pressable onPress={() => openTask(task)} accessibilityRole="button" style={styles.flex}>
                          <Text numberOfLines={2} style={[styles.eventTitle, task.status === 'done' && styles.strike]}>{task.title}{task.repeating ? ' ↻' : ''}</Text>
                          <Text style={styles.small}>{formatTimeKey(clockAt(start))}{task.end_time ? ` - ${formatTimeKey(task.end_time)}` : ''}</Text>
                        </Pressable>
                        <View style={styles.row}>
                          <TaskDragHandle onStart={(x, y) => beginDrag(task, 'move', x, y)} onMove={moveDrag} onEnd={finishDrag} onCancel={cancelDrag} />
                          {task.start_time && <TaskDragHandle resize onStart={(x, y) => beginDrag(task, 'resize', x, y)} onMove={moveDrag} onEnd={finishDrag} onCancel={cancelDrag} />}
                        </View>
                      </View>;
                    })}
                  </View>
                  </ScrollView>
                  </View>
                </>
              )}
              {showOverdue && (
                <View style={styles.stack}>
                  <Text style={styles.heading}>Overdue tasks</Text>
                  <Text style={styles.small}>All overdue one-off tasks; recurring tasks from the previous 30 days. Select an older date to view earlier recurring tasks.</Text>
                  {overdue.filter(accepted).length ? overdue.filter(accepted).map(taskCard) : <Text style={styles.small}>No overdue tasks in this window.</Text>}
                </View>
              )}
              <Text style={styles.small}>Colors use task labels first, otherwise red/high, amber/medium, blue/low. Tap tasks for details. Recurring changes affect only that date; edit the series in the task editor.</Text>
            </>
          )}
        </ScrollView>
        {drag && <Animated.View pointerEvents="none" style={[styles.preview, { transform: position.getTranslateTransform() }]}><Text style={styles.previewText}>{dragLabel}</Text></Animated.View>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 },
  header: { paddingHorizontal: spacing.md, gap: spacing.sm },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2 },
  stack: { gap: spacing.sm }, heading: { color: colors.text, fontSize: 14, fontWeight: '700' },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' }, small: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  weekdays: { flexDirection: 'row' }, weekday: { width: '14.2857%', textAlign: 'center', color: colors.textMuted, fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' }, dateCell: { width: '14.2857%', padding: 2 }, weekCell: { minHeight: 85 },
  dateButton: { minHeight: 68, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  selectedDate: { backgroundColor: colors.primarySoft }, today: { borderColor: colors.primary, borderWidth: 2 }, todayText: { color: colors.primary },
  drop: { backgroundColor: '#C6EAD6', borderColor: colors.primary }, dots: { flexDirection: 'row', gap: 2, minHeight: 7, marginVertical: 3 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  task: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderLeftWidth: 4, backgroundColor: colors.surface, padding: spacing.sm, borderRadius: radius.sm },
  check: { width: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, strike: { textDecorationLine: 'line-through', color: colors.textMuted },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, miniMonth: { width: '48%', gap: spacing.sm, padding: 4 },
  miniGrid: { flexDirection: 'row', flexWrap: 'wrap' }, miniCell: { width: '14.2857%', minHeight: 25, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  timeline: { height: 1440 * PX_PER_MINUTE, position: 'relative', backgroundColor: colors.surface },
  hour: { height: 60 * PX_PER_MINUTE, borderTopWidth: 1, borderColor: colors.border },
  hourLabel: { width: 58, fontSize: 10, color: colors.textMuted },
  event: { position: 'absolute', backgroundColor: colors.primarySoft, borderLeftWidth: 4, padding: 3, borderRadius: 4, minHeight: 90 },
  eventTitle: { fontSize: 12, fontWeight: '700', color: colors.text },
  preview: { position: 'absolute', left: 0, top: 0, width: 220, padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.primary, zIndex: 30, elevation: 8 },
  previewText: { color: colors.onPrimary, fontWeight: '700' },
});

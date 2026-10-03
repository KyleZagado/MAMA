import type { Session } from '@supabase/supabase-js';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, FlatList, Modal, Pressable, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, ChipRow, formStyles, PrimaryButton } from '../components/form';
import { PickerField } from '../components/picker-field';
import { ScreenHeader } from '../components/screen-header';
import { TaskDragHandle } from '../components/task-drag-handle';
import { TASK_STATUSES } from '../constants/tasks';
import { lightColors as colors, radius, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import {
  changeTodos, duplicateTodo, getTaskUndo, listTodos, reorderTodos, undoTaskAction,
  type TaskAction, type Todo,
} from '../database/todos';
import { addDaysToKey, formatTimeKey, fromDateKey, toDateKey } from '../lib/dates';
import { findTaskDropTarget, taskDropOrder, type TaskDropTarget } from '../lib/task-drag';

export function TaskManager({ session }: { session: Session }) {
  const [tasks, setTasks] = useState<Todo[]>([]);
  const [mode, setMode] = useState<'day' | 'all' | 'archived'>('day');
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [undo, setUndo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState<string[] | null>(null);
  const [moveDate, setMoveDate] = useState(() => new Date());
  const [dragging, setDragging] = useState<Todo | null>(null);
  const [hover, setHover] = useState<TaskDropTarget | null>(null);
  const busyRef = useRef(false);
  const request = useRef(0);
  const dateViews = useRef(new Map<string, View>());
  const rowViews = useRef(new Map<string, View>());
  const targets = useRef<TaskDropTarget[]>([]);
  const root = useRef<View>(null);
  const rootPosition = useRef({ x: 0, y: 0 });
  const [dragPosition] = useState(() => new Animated.ValueXY());
  const dragged = useRef<Todo | null>(null);
  const hovered = useRef<string | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDaysToKey(date, index - 3)), [date]);
  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(() => tasks.filter((task) =>
    (mode !== 'day' || (task.scheduled && task.due_date === date)) &&
    (!normalizedQuery || `${task.title} ${task.notes ?? ''} ${task.tags.join(' ')} ${task.category ?? ''} ${task.location ?? ''}`.toLowerCase().includes(normalizedQuery))),
  [tasks, mode, date, normalizedQuery]);

  const reload = useCallback(async () => {
    const token = ++request.current;
    setIsLoading(true);
    setError(null);
    try {
      const db = await getDatabase(session.user.id);
      const [rows, nextUndo] = await Promise.all([listTodos(db, mode === 'archived', false, true), getTaskUndo(db)]);
      if (token !== request.current) return;
      setTasks(rows);
      setUndo(nextUndo?.label ?? null);
      setSelection((ids) => ids.filter((id) => rows.some((row) => row.id === id)));
    } catch (e: unknown) {
      if (token === request.current) setError(e instanceof Error ? e.message : 'Could not load tasks.');
    } finally {
      if (token === request.current) setIsLoading(false);
    }
  }, [session.user.id, mode]);

  useFocusEffect(useCallback(() => {
    void reload();
    return () => { request.current++; };
  }, [reload]));

  async function run(action: (db: Awaited<ReturnType<typeof getDatabase>>) => Promise<unknown>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await action(await getDatabase(session.user.id));
      setSelection([]);
      setMoving(null);
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not update tasks.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function perform(ids: string[], action: TaskAction) {
    if (action.type === 'status' && tasks.some((task) => ids.includes(task.id) && task.recurrence_rule)) {
      setError('Use Calendar to complete individual recurring dates. Bulk completion here applies to one-off tasks and saved occurrences, not repeat templates.');
      return;
    }
    if (action.type === 'delete') {
      Alert.alert(`Delete ${ids.length === 1 ? 'task' : `${ids.length} tasks`}?`, 'You can undo this action here.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void run((db) => changeTodos(db, ids, action)) },
      ]);
    } else void run((db) => changeTodos(db, ids, action));
  }

  function reschedule(ids: string[]) {
    setMoveDate(fromDateKey(date));
    setMoving(ids);
  }

  function toggleSelection(id: string) {
    setSelection((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  }

  function cancelDrag() {
    dragged.current = null;
    hovered.current = null;
    setDragging(null);
    setHover(null);
    targets.current = [];
  }

  function startDrag(task: Todo, x: number, y: number) {
    if (busyRef.current || isLoading || selecting) return;
    targets.current = [];
    dragged.current = task;
    root.current?.measureInWindow((rootX, rootY) => { rootPosition.current = { x: rootX, y: rootY }; });
    for (const [key, view] of dateViews.current) {
      view.measureInWindow((rx, ry, width, height) => {
        if (dragged.current?.id === task.id) targets.current.push({ kind: 'date', key, rect: { x: rx, y: ry, width, height } });
      });
    }
    if (mode === 'day' && !normalizedQuery) {
      for (const [key, view] of rowViews.current) {
        view.measureInWindow((rx, ry, width, height) => {
          if (dragged.current?.id === task.id) targets.current.push({ kind: 'task', key, rect: { x: rx, y: ry, width, height } });
        });
      }
    }
    dragPosition.setValue({ x: x - rootPosition.current.x - 100, y: y - rootPosition.current.y - 60 });
    setDragging(task);
  }

  function moveDrag(x: number, y: number) {
    if (!dragged.current) return;
    dragPosition.setValue({ x: x - rootPosition.current.x - 100, y: y - rootPosition.current.y - 60 });
    const target = findTaskDropTarget(targets.current, x, y);
    const key = target ? `${target.kind}/${target.key}` : null;
    if (key !== hovered.current) {
      hovered.current = key;
      setHover(target);
    }
  }

  function endDrag(x: number, y: number) {
    const task = dragged.current;
    const target = findTaskDropTarget(targets.current, x, y);
    cancelDrag();
    if (!task || !target) return;
    if (target.kind === 'date' && (!task.scheduled || target.key !== task.due_date)) {
      void run((db) => changeTodos(db, [task.id], { type: 'reschedule', dueDate: target.key }));
    } else if (target.kind === 'task' && target.key !== task.id && mode === 'day' && !normalizedQuery) {
      const ids = taskDropOrder(visible.map((item) => item.id), task.id, target, y);
      if (ids) void run((db) => reorderTodos(db, ids));
    }
  }

  function changeMode(next: typeof mode) {
    setSelection([]);
    setMode(next);
  }

  const enabled = !busy && !isLoading && !dragging;
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View ref={root} style={styles.flex} onLayout={() => root.current?.measureInWindow((x, y) => { rootPosition.current = { x, y }; })}>
        <View style={styles.top}>
          <ScreenHeader title="Manage Tasks" />
          <ChipRow>
            <Chip label="New task" selected={false} disabled={!enabled} onPress={() => router.push({ pathname: '/task-form', params: { date } })} />
            <Chip label="Calendar" selected={false} disabled={!enabled} onPress={() => router.push('/task-calendar')} />
            <Chip label="Lists / Group tasks" selected={false} disabled={!enabled} onPress={() => router.push('/task-lists')} />
            <Chip label={selecting ? 'Finish selection' : 'Bulk select'} selected={selecting} disabled={!enabled} onPress={() => { setSelecting(!selecting); setSelection([]); }} />
            {undo && <Chip label={`Undo: ${undo}`} selected={false} disabled={!enabled} onPress={() => void run(undoTaskAction)} />}
          </ChipRow>
          <ChipRow>
            <Chip label="Day" selected={mode === 'day'} onPress={() => changeMode('day')} />
            <Chip label="All tasks" selected={mode === 'all'} onPress={() => changeMode('all')} />
            <Chip label="Archived" selected={mode === 'archived'} onPress={() => changeMode('archived')} />
          </ChipRow>
          <TextInput value={query} onChangeText={(value) => { setQuery(value); setSelection([]); }} placeholder="Search title, notes, tags, category, location" style={formStyles.input} accessibilityLabel="Search tasks" />
          {mode !== 'archived' && (
            <>
              <View style={styles.row}>
                <Chip label="< Week" selected={false} onPress={() => { setDate(addDaysToKey(date, -7)); setSelection([]); }} />
                <PickerField mode="date" value={fromDateKey(date)} onChange={(value) => { setDate(toDateKey(value)); setSelection([]); }} />
                <Chip label="Week >" selected={false} onPress={() => { setDate(addDaysToKey(date, 7)); setSelection([]); }} />
              </View>
              <View style={styles.dates}>
                {days.map((key) => (
                  <View key={key} collapsable={false} ref={(view) => { if (view) dateViews.current.set(key, view); else dateViews.current.delete(key); }} style={styles.dateCell}>
                    <Pressable onPress={() => { setDate(key); setSelection([]); }}
                      style={[styles.dateButton, date === key && styles.selectedDate, hover?.kind === 'date' && hover.key === key && styles.dropTarget]}
                      accessibilityRole="button" accessibilityLabel={`Show tasks on ${key}`} accessibilityState={{ selected: date === key }}>
                      <Text style={styles.small}>{fromDateKey(key).toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                      <Text style={styles.heading}>{fromDateKey(key).getDate()}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          )}
          <Text style={styles.small}>{selecting ? `${selection.length} selected`
            : mode === 'archived' ? 'Archived tasks stay hidden from the To-Do home.'
              : 'Drag the grip onto a date. In Day view, drop on a task to reorder. Move is also available below.'}</Text>
          {selecting && (
            <ChipRow>
              <Chip label="Select shown" selected={selection.length > 0 && selection.length === visible.length} disabled={!enabled || !visible.length} onPress={() => setSelection(visible.map((item) => item.id))} />
              <Chip label="Complete" selected={false} disabled={!enabled || !selection.length} onPress={() => perform(selection, { type: 'status', status: 'done' })} />
              <Chip label="Delete" selected={false} disabled={!enabled || !selection.length} onPress={() => perform(selection, { type: 'delete' })} />
              <Chip label="Reschedule" selected={false} disabled={!enabled || !selection.length} onPress={() => reschedule(selection)} />
            </ChipRow>
          )}
          {error && <Text style={formStyles.error}>{error}</Text>}
          {error && <PrimaryButton label="Reload tasks" onPress={() => void reload()} disabled={busy} />}
          {(isLoading || busy) && <ActivityIndicator color={colors.primary} />}
        </View>
        <FlatList data={isLoading ? [] : visible} keyExtractor={(item) => item.id}
          scrollEnabled={!dragging} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}
          ListEmptyComponent={!isLoading ? <Text style={styles.hint}>No tasks in this view.</Text> : null}
          renderItem={({ item }) => (
            <View collapsable={false} ref={(view) => { if (view) rowViews.current.set(item.id, view); else rowViews.current.delete(item.id); }}
              style={[formStyles.card, item.color && { borderLeftColor: item.color, borderLeftWidth: 5 },
                hover?.kind === 'task' && hover.key === item.id && styles.dropTarget, dragging?.id === item.id && styles.dragSource]}>
              <View style={styles.row}>
                <Pressable disabled={!selecting && Boolean(item.recurrence_rule)} onPress={() => selecting ? toggleSelection(item.id) : enabled && perform([item.id], { type: 'status', status: item.status === 'done' ? 'todo' : 'done' })}
                  style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: selecting ? selection.includes(item.id) : item.status === 'done', disabled: !selecting && Boolean(item.recurrence_rule) }} accessibilityLabel={`${selecting ? 'Select' : 'Complete'} ${item.title}`}>
                  <Text style={styles.heading}>{(selecting ? selection.includes(item.id) : item.status === 'done') ? '[x]' : '[ ]'}</Text>
                </Pressable>
                <Pressable style={styles.flex} onPress={() => selecting ? toggleSelection(item.id) : router.push({ pathname: '/task-form', params: { id: item.id } })} accessibilityRole="button">
                  <Text style={[styles.heading, item.status === 'done' && styles.strike]}>{item.title}</Text>
                  <Text style={styles.small}>{item.scheduled ? item.due_date : 'Unscheduled'} · {item.all_day ? 'All day' : `Due ${item.due_time ? formatTimeKey(item.due_time) : 'no time'}`}
                    {` · ${item.priority} · ${TASK_STATUSES.find((option) => option.id === item.status)?.label}`}</Text>
                </Pressable>
                {mode !== 'archived' && !selecting && !busy && !isLoading && <TaskDragHandle onStart={(x, y) => startDrag(item, x, y)} onMove={moveDrag} onEnd={endDrag} onCancel={cancelDrag} />}
              </View>
              {item.notes && <Text style={styles.hint} numberOfLines={2}>{item.notes}</Text>}
              {item.recurrence_rule && <Text style={styles.small}>Repeat series template: use Calendar for individual dates. Archive/delete here affects the whole series.</Text>}
              <Text style={styles.small}>
                {item.start_time ? `Start ${formatTimeKey(item.start_time)} · ` : ''}{item.end_time ? `End ${formatTimeKey(item.end_time)} · ` : ''}
                {item.category ?? 'No category'}{item.tags.length ? ` · #${item.tags.join(' #')}` : ''}
                {item.location ? ` · ${item.location}` : ''}
              </Text>
              {item.subtasks.length > 0 && <Text style={styles.small}>{item.subtasks.filter((task) => task.done).length}/{item.subtasks.length} checklist items done</Text>}
              {(item.photos.length > 0 || item.links.length > 0) && <Text style={styles.small}>{item.photos.length} photo(s) · {item.links.length} link(s)</Text>}
              {(item.estimated_minutes != null || item.actual_minutes != null) && <Text style={styles.small}>Estimated {item.estimated_minutes ?? '-'} min · Actual {item.actual_minutes ?? '-'} min</Text>}
              {!selecting && <ChipRow>
                <Chip label="Edit" selected={false} disabled={!enabled} onPress={() => router.push({ pathname: '/task-form', params: { id: item.id } })} />
                <Chip label="Move / reschedule" selected={false} disabled={!enabled} onPress={() => reschedule([item.id])} />
                <Chip label="Duplicate" selected={false} disabled={!enabled} onPress={() => void run((db) => duplicateTodo(db, item.id))} />
                <Chip label={mode === 'archived' ? 'Unarchive' : 'Archive'} selected={false} disabled={!enabled} onPress={() => perform([item.id], { type: 'archive', archived: mode !== 'archived' })} />
                <Chip label="Delete" selected={false} disabled={!enabled} onPress={() => perform([item.id], { type: 'delete' })} />
              </ChipRow>}
            </View>
          )} />
        {dragging && <Animated.View pointerEvents="none" style={[styles.dragPreview, { transform: dragPosition.getTranslateTransform() }]}>
          <Text numberOfLines={1} style={styles.dragText}>{dragging.title}</Text>
        </Animated.View>}
        <Modal visible={moving !== null} transparent animationType="fade" onRequestClose={() => { if (!busy) setMoving(null); }}>
          <View style={styles.backdrop}><View style={styles.dialog}>
            <Text style={styles.heading}>Reschedule {moving?.length} task(s)</Text>
            <PickerField mode="date" value={moveDate} onChange={setMoveDate} />
            <Text style={styles.hint}>Date changes preserve times, status, checklist, and attachments.</Text>
            {error && <Text style={formStyles.error}>{error}</Text>}
            <PrimaryButton label="Move tasks" loading={busy} onPress={() => { if (moving) void run((db) => changeTodos(db, moving, { type: 'reschedule', dueDate: toDateKey(moveDate) })); }} />
            <PrimaryButton label="Cancel" disabled={busy} onPress={() => setMoving(null)} />
          </View></View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 },
  top: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  dates: { flexDirection: 'row', gap: 4 }, dateCell: { flex: 1 },
  dateButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  selectedDate: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  heading: { color: colors.text, fontSize: 15, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 14, lineHeight: 21 }, small: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  check: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  strike: { textDecorationLine: 'line-through', color: colors.textMuted },
  dropTarget: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primarySoft },
  dragSource: { opacity: 0.5 },
  dragPreview: { position: 'absolute', left: 0, top: 0, width: 200, padding: spacing.md, backgroundColor: colors.primary, borderRadius: radius.md, elevation: 8, zIndex: 10 },
  dragText: { color: colors.onPrimary, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: spacing.lg },
  dialog: { backgroundColor: colors.background, padding: spacing.lg, borderRadius: radius.lg, gap: spacing.lg },
});

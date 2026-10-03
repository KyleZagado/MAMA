import type { Session } from '@supabase/supabase-js';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, ChipRow, FieldLabel, formStyles, PrimaryButton } from '../components/form';
import { ScreenHeader } from '../components/screen-header';
import { lightColors as colors, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import { createTaskList, getTaskUndo, listTaskLists, listTodos, setTaskFavorite, setTodoDone, undoTaskAction, type Todo } from '../database/todos';
import { formatTimeKey, toDateKey, toTimeKey } from '../lib/dates';
import { filterTaskView, groupTasks, isTaskOverdue, PRIORITY_COLORS, TASK_GROUPS, TASK_VIEWS, type TaskGroup, type TaskView } from '../lib/task-organization';

function editTask(task: Todo) {
  const separator = task.id.lastIndexOf('/');
  router.push({ pathname: '/task-form', params: separator < 0 ? { id: task.id }
    : { id: task.id.slice(0, separator), occurrence: task.id.slice(separator + 1) } });
}

function taskTimeLabel(task: Todo) {
  const time = task.due_time ?? task.start_time;
  return task.scheduled && !task.all_day && time ? ` · ${formatTimeKey(time)}` : '';
}

export function TaskLists({ session }: { session: Session }) {
  const [tasks, setTasks] = useState<Todo[]>([]);
  const [lists, setLists] = useState<string[]>([]);
  const [view, setView] = useState<TaskView>('today');
  const [group, setGroup] = useState<TaskGroup>('Priority');
  const [list, setList] = useState<string | null>(null);
  const [newList, setNewList] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const request = useRef(0);
  const writing = useRef(false);
  const today = toDateKey(now);
  const nowTime = toTimeKey(now);

  const reload = useCallback(async () => {
    const token = ++request.current;
    setLoading(true);
    try {
      const db = await getDatabase(session.user.id);
      const [rows, names, lastUndo] = await Promise.all([listTodos(db, false, true, true), listTaskLists(db), getTaskUndo(db)]);
      if (request.current !== token) return;
      setTasks(rows);
      setLists(names);
      setUndo(lastUndo?.label ?? null);
      setNow(new Date());
    } catch (e: unknown) {
      if (request.current === token) setError(e instanceof Error ? e.message : 'Could not load task lists.');
    } finally {
      if (request.current === token) setLoading(false);
    }
  }, [session.user.id]);

  useEffect(() => {
    const timer = setInterval(() => {
      const next = new Date();
      setNow(next);
      if (toDateKey(next) !== today) void reload();
    }, 60_000);
    return () => clearInterval(timer);
  }, [reload, today]);

  useFocusEffect(useCallback(() => {
    setError(null);
    void reload();
    return () => { request.current++; };
  }, [reload]));

  async function run(action: (db: Awaited<ReturnType<typeof getDatabase>>) => Promise<unknown>) {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    setError(null);
    try {
      await action(await getDatabase(session.user.id));
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not update tasks.');
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  const visible = useMemo(() => filterTaskView(tasks, view, today, nowTime, list, query),
    [tasks, view, today, nowTime, list, query]);
  const sections = useMemo(() => groupTasks(visible, group, today), [visible, group, today]);
  const disabled = busy || loading;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <SectionList sections={loading ? [] : sections} keyExtractor={(task) => task.id}
        stickySectionHeadersEnabled={false} keyboardShouldPersistTaps="handled" contentContainerStyle={formStyles.content}
        ListHeaderComponent={<View style={styles.header}>
          <ScreenHeader title="Task Lists" />
          <ChipRow>
            <Chip label="+ Task" selected={false} disabled={disabled} onPress={() => router.push('/task-form')} />
            <Chip label="Calendar" selected={false} onPress={() => router.push('/task-calendar')} />
            <Chip label="Bulk / Manage" selected={false} onPress={() => router.push('/tasks')} />
            {undo && <Chip label={`Undo: ${undo}`} selected={false} disabled={disabled} onPress={() => void run(undoTaskAction)} />}
          </ChipRow>
          <FieldLabel>LIST VIEW</FieldLabel>
          <ChipRow>{TASK_VIEWS.map((option) => <Chip key={option.id} label={option.label} selected={view === option.id} onPress={() => setView(option.id)} />)}</ChipRow>
          {view === 'lists' && <>
            <ChipRow>
              <Chip label="No list" selected={list === null} onPress={() => setList(null)} />
              {lists.map((name) => <Chip key={name} label={name} selected={list === name} onPress={() => setList(name)} />)}
            </ChipRow>
            <TextInput value={newList} onChangeText={setNewList} maxLength={60} placeholder="New list name" accessibilityLabel="New list name" style={formStyles.input} />
            <PrimaryButton label="Create list" disabled={disabled || !newList.trim()} onPress={() => void run(async (db) => {
              await createTaskList(db, newList);
              setList(newList.trim());
              setNewList('');
            })} />
            <Text style={styles.hint}>Assign a task to one list in its editor. Projects are separate from lists.</Text>
          </>}
          <TextInput value={query} onChangeText={setQuery} placeholder="Search tasks, lists, projects, tags, locations" accessibilityLabel="Search task lists" style={formStyles.input} />
          <FieldLabel>GROUP BY</FieldLabel>
          <ChipRow>{TASK_GROUPS.map((option) => <Chip key={option} label={option} selected={group === option} onPress={() => setGroup(option)} />)}</ChipRow>
          <Text style={styles.hint}>{visible.length} task(s). Today, Tomorrow, Upcoming and Overdue show unfinished tasks.
            {' '}Recurring dates span 30 days back through one year ahead; use Calendar for other dates.
            {group === 'Tag' ? ' A task with multiple tags appears under each tag.' : ''}</Text>
          {error && <><Text style={formStyles.error}>{error}</Text><PrimaryButton label="Reload" disabled={busy} onPress={() => { setError(null); void reload(); }} /></>}
          {disabled && <ActivityIndicator color={colors.primary} />}
        </View>}
        ListEmptyComponent={!loading ? <Text style={styles.hint}>No tasks in this view. Add a task or choose another view.</Text> : null}
        renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title} ({section.data.length})</Text>}
        renderItem={({ item }) => <View style={[formStyles.card, { borderLeftWidth: 4, borderLeftColor: item.color ?? PRIORITY_COLORS[item.priority] }]}>
          <View style={styles.row}>
            <Pressable disabled={disabled} onPress={() => void run((db) => setTodoDone(db, item.id, item.status !== 'done'))}
              accessibilityRole="checkbox" accessibilityState={{ checked: item.status === 'done', disabled }} accessibilityLabel={`Complete ${item.title}`} style={styles.control}>
              <Text style={styles.title}>{item.status === 'done' ? '[x]' : '[ ]'}</Text>
            </Pressable>
            <Pressable style={styles.flex} onPress={() => editTask(item)} accessibilityRole="button" accessibilityLabel={`Open ${item.title}`}>
              <Text style={[styles.title, item.status === 'done' && styles.done]}>{item.title}</Text>
              <Text style={styles.hint}>{item.scheduled ? item.due_date : 'Unscheduled'}
                {taskTimeLabel(item)}
                {item.series_id ? ' · Repeating' : ''}
                {isTaskOverdue(item, today, nowTime) ? ' · Overdue' : ''}</Text>
            </Pressable>
            <Pressable disabled={disabled} style={styles.control} onPress={() => void run((db) => setTaskFavorite(db, item, !item.favorite))}
              accessibilityRole="button" accessibilityLabel={`${item.favorite ? 'Remove from' : 'Add to'} favorites: ${item.title}`}>
              <Text style={styles.hint}>{item.favorite ? 'Unfavorite' : 'Favorite'}</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>{item.priority} · {item.status === 'in_progress' ? 'In Progress' : item.status === 'done' ? 'Done' : 'To Do'}
            {item.list_name ? ` · List: ${item.list_name}` : ''}{item.project ? ` · Project: ${item.project}` : ''}
            {item.category ? ` · ${item.category}` : ''}{item.location ? ` · ${item.location}` : ''}
            {item.tags.length ? ` · #${item.tags.join(' #')}` : ''}</Text>
        </View>} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { gap: spacing.md, marginBottom: spacing.md },
  section: { fontSize: 18, fontWeight: '700', color: colors.text, marginVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  control: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  hint: { fontSize: 13, color: colors.textSubtle },
  done: { textDecorationLine: 'line-through', opacity: 0.6 },
});
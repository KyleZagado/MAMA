import { createThemedStyleSheet } from '../providers/theme-provider';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { PageHeader } from '../components/page-header';
import { RoundButton } from '../components/round-button';
import { lightColors as colors, MAX_CONTENT_WIDTH, radius, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import {
  createTaskList,
  deleteTaskList,
  listTaskLists,
  setTodoDone,
  undoTaskAction,
  type Todo,
} from '../database/todos';
import { useTodos } from '../hooks/use-todos';
import { addDaysToKey, formatDateKey, formatTimeKey, toDateKey } from '../lib/dates';
import {
  buildTodoLists,
  collapseRepeats,
  isInList,
  listColor,
  taskListName,
  type TodoListSummary,
} from '../lib/todo-lists';

type SortMode = 'priority' | 'time';

const PRIORITIES: { id: 'high' | 'medium' | 'low'; label: string; background: string; color: string }[] = [
  { id: 'high', label: 'HIGH', background: '#F8E4E0', color: '#B3443A' },
  { id: 'medium', label: 'MEDIUM', background: '#F8EBDD', color: '#A86A2A' },
  { id: 'low', label: 'LOW', background: '#E6F1EA', color: '#5D7F6E' },
];
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

const RHYTHM_CARD = '#1B2420';

function byPriorityThenTime(a: Todo, b: Todo) {
  const rank = (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3);
  return rank || byTimeThenPriority(a, b, false);
}

function byTimeThenPriority(a: Todo, b: Todo, priorityTieBreak = true) {
  const timeA = a.due_time ?? a.start_time ?? '99:99';
  const timeB = b.due_time ?? b.start_time ?? '99:99';
  if (timeA !== timeB) return timeA < timeB ? -1 : 1;
  if (priorityTieBreak) {
    const rank = (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3);
    if (rank) return rank;
  }
  return a.sort_order - b.sort_order || a.created_at - b.created_at;
}

function byDateThenTime(a: Todo, b: Todo) {
  if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
  return byTimeThenPriority(a, b);
}

function Count({ value }: { value: number }) {
  return (
    <View style={styles.count}>
      <Text style={styles.countText}>{value}</Text>
    </View>
  );
}

function TaskCard({
  todo,
  subtitle,
  onToggle,
  onMenu,
}: {
  todo: Todo;
  subtitle: string;
  onToggle: () => void;
  onMenu: () => void;
}) {
  const done = todo.status === 'done';
  const displayTime = todo.due_time ?? todo.start_time;
  const priority = PRIORITIES.find((item) => item.id === todo.priority) ?? PRIORITIES[1];
  return (
    <View style={[styles.task, done && styles.taskDone]}>
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        style={[styles.check, done && styles.checkDone]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={todo.title}
      >
        {done && <Ionicons name="checkmark" size={16} color={colors.onPrimary} />}
      </Pressable>
      <Pressable style={styles.taskBody} onPress={onMenu} accessibilityRole="button" accessibilityLabel={`Edit ${todo.title}`}>
        <Text style={[styles.taskTitle, done && styles.strike]} numberOfLines={1}>
          {todo.title}
        </Text>
        <View style={styles.taskMeta}>
          <View style={[styles.dot, { backgroundColor: listColor(taskListName(todo)) ?? todo.color ?? colors.textSubtle }]} />
          <Text style={styles.taskSubtitle} numberOfLines={1}>
            {subtitle}
            {todo.status === 'in_progress' ? ' · In Progress' : ''}
            {todo.subtasks.length ? ` · ${todo.subtasks.filter((item) => item.done).length}/${todo.subtasks.length}` : ''}
          </Text>
        </View>
      </Pressable>
      {displayTime && <Text style={styles.taskTime}>{formatTimeKey(displayTime)}</Text>}
      <View style={[styles.pill, { backgroundColor: priority.background }, done && styles.fade]}>
        <Text style={[styles.pillText, { color: priority.color }]}>{priority.label}</Text>
      </View>
      <Pressable onPress={onMenu} hitSlop={8} accessibilityRole="button" accessibilityLabel="Task options">
        <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSubtle} />
      </Pressable>
    </View>
  );
}

type Selection = { kind: 'today' } | { kind: 'all' } | { kind: 'list'; name: string };

type Section = { key: string; title: string; tasks: Todo[] };

export function Todos({ session, isVisible = true }: { session: Session; isVisible?: boolean }) {
  const { todos, error, reload, undo, isLoading } = useTodos(session.user.id, true);
  const busy = useRef(false);
  const [savedLists, setSavedLists] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('priority');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const todayKey = toDateKey(new Date());
  const weekEndKey = addDaysToKey(todayKey, 6);
  const query = search.trim().toLowerCase();

  const loadLists = useCallback(async () => {
    try {
      setSavedLists(await listTaskLists(await getDatabase(session.user.id)));
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Could not load your lists.');
    }
  }, [session.user.id]);

  useFocusEffect(
    useCallback(() => {
      void loadLists();
    }, [loadLists]),
  );

  const closeList = useCallback(() => {
    setSelection(null);
    setShowCompleted(false);
  }, []);

  useEffect(() => {
    if (!selection || !isVisible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeList();
      return true;
    });
    return () => subscription.remove();
  }, [closeList, isVisible, selection]);

  const tasks = useMemo(() => collapseRepeats(todos, todayKey), [todos, todayKey]);
  const lists = useMemo(() => buildTodoLists(savedLists, tasks), [savedLists, tasks]);

  const todayTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.scheduled && (t.due_date === todayKey || (t.due_date < todayKey && t.status !== 'done')))
        .sort(sort === 'priority' ? byPriorityThenTime : byTimeThenPriority),
    [tasks, todayKey, sort],
  );
  const doneToday = todayTasks.filter((t) => t.status === 'done').length;
  const totalToday = todayTasks.length;
  const percent = totalToday ? Math.round((doneToday / totalToday) * 100) : 0;
  const allOpen = tasks.filter((t) => t.status !== 'done').length;

  const results = useMemo(
    () =>
      query
        ? tasks
            .filter((t) =>
              `${t.title} ${taskListName(t) ?? ''} ${t.notes ?? ''} ${t.tags.join(' ')}`.toLowerCase().includes(query),
            )
            .sort(byDateThenTime)
        : [],
    [tasks, query],
  );

  const sections = useMemo<Section[]>(() => {
    if (!selection || selection.kind === 'today') return [];
    const scope = selection.kind === 'all' ? tasks : tasks.filter((t) => isInList(t, selection.name));
    const open = scope.filter((t) => t.status !== 'done');
    return [
      { key: 'overdue', title: 'Overdue', tasks: open.filter((t) => t.scheduled && t.due_date < todayKey).sort(byDateThenTime) },
      { key: 'today', title: 'Today', tasks: open.filter((t) => t.scheduled && t.due_date === todayKey).sort(byTimeThenPriority) },
      { key: 'upcoming', title: 'Upcoming', tasks: open.filter((t) => t.scheduled && t.due_date > todayKey).sort(byDateThenTime) },
      { key: 'someday', title: 'No date', tasks: open.filter((t) => !t.scheduled).sort(byPriorityThenTime) },
      { key: 'completed', title: 'Completed', tasks: scope.filter((t) => t.status === 'done').sort((a, b) => b.updated_at - a.updated_at) },
    ];
  }, [selection, tasks, todayKey]);

  function dateLabel(todo: Todo) {
    if (!todo.scheduled) return 'No date';
    if (todo.due_date === todayKey) return 'Today';
    if (todo.due_date < todayKey) return `Overdue · ${formatDateKey(todo.due_date, 'short')}`;
    return todo.due_date <= weekEndKey ? formatDateKey(todo.due_date, 'weekday') : formatDateKey(todo.due_date, 'short');
  }

  function subtitleFor(todo: Todo, showList: boolean) {
    const list = taskListName(todo);
    if (selection?.kind === 'today') {
      const label = list ?? 'Task';
      if (todo.due_date < todayKey) return `Overdue · ${label}`;
      return todo.notes ? `${label} · ${todo.notes}` : label;
    }
    return [dateLabel(todo), showList ? list : null].filter(Boolean).join(' · ');
  }

  async function run(action: (db: Awaited<ReturnType<typeof getDatabase>>) => Promise<unknown>) {
    if (busy.current || isLoading) return false;
    busy.current = true;
    try {
      setActionError(null);
      await action(await getDatabase(session.user.id));
      await Promise.all([reload(), loadLists()]);
      return true;
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Something went wrong.');
      return false;
    } finally {
      busy.current = false;
    }
  }

  function createList() {
    const name = newListName.trim();
    if (!name) return;
    if (lists.some((item) => item.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0)) {
      setActionError('A list with this name already exists.');
      return;
    }
    Keyboard.dismiss();
    void run((db) => createTaskList(db, name)).then((saved) => {
      if (!saved) return;
      setNewListName('');
      setNewListOpen(false);
    });
  }

  function confirmDeleteList(name: string) {
    Alert.alert(`Delete “${name}”?`, 'Its tasks are kept but will no longer belong to this list.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteList(name) },
    ]);
  }

  function deleteList(name: string) {
    void run((db) => deleteTaskList(db, name));
  }

  function openList(next: Selection) {
    Keyboard.dismiss();
    setSearch('');
    setShowCompleted(false);
    setSelection(next);
  }

  function addTask() {
    if (selection?.kind === 'list') router.push({ pathname: '/task-form', params: { list: selection.name } });
    else router.push('/task-form');
  }

  function openMenu(todo: Todo) {
    const separator = todo.id.lastIndexOf('/');
    router.push({ pathname: '/task-form', params: separator < 0 ? { id: todo.id }
      : { id: todo.id.slice(0, separator), occurrence: todo.id.slice(separator + 1) } });
  }

  function renderCards(list: Todo[], showList = true) {
    return list.map((todo) => (
      <TaskCard
        key={todo.id}
        todo={todo}
        subtitle={subtitleFor(todo, showList)}
        onToggle={() => run((db) => setTodoDone(db, todo.id, todo.status !== 'done'))}
        onMenu={() => openMenu(todo)}
      />
    ));
  }

  const activeList = selection?.kind === 'list' ? lists.find((item) => isInList({ list_name: item.name, category: null }, selection.name)) : null;
  const selectionTitle = !selection ? '' : selection.kind === 'today' ? 'Today' : selection.kind === 'all' ? 'All' : activeList?.name ?? selection.name;
  const selectionColor = !selection ? colors.primary : selection.kind === 'today' ? colors.primary : selection.kind === 'all' ? colors.textMuted : activeList?.color ?? colors.primary;
  const selectionIcon = (!selection || selection.kind === 'today' ? 'today-outline' : selection.kind === 'all' ? 'file-tray-outline' : activeList?.icon ?? 'list-outline') as React.ComponentProps<typeof Ionicons>['name'];

  function renderListDetail() {
    if (!selection) return null;
    const openCount = selection.kind === 'today' ? totalToday - doneToday : sections.slice(0, 4).reduce((sum, item) => sum + item.tasks.length, 0);
    const completed = sections.find((item) => item.key === 'completed')?.tasks ?? [];
    return (
      <>
        <Pressable onPress={closeList} hitSlop={8} style={styles.back} accessibilityRole="button" accessibilityLabel="Back to lists">
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={styles.backText}>To-do</Text>
        </Pressable>
        <View style={styles.detailHeading}>
          <View style={[styles.listIcon, styles.listIconLarge, { backgroundColor: selectionColor }]}>
            <Ionicons name={selectionIcon} size={20} color="#FFFFFF" />
          </View>
          <Text style={[styles.detailTitle, { color: selectionColor }]} numberOfLines={1} accessibilityRole="header">
            {selectionTitle}
          </Text>
          <Text style={styles.detailCount}>{openCount}</Text>
        </View>

        {selection.kind === 'today' ? (
          <>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionLabel}>{totalToday ? `${doneToday} of ${totalToday} done` : 'Nothing today'}</Text>
              <Pressable
                onPress={() => setSort((mode) => (mode === 'priority' ? 'time' : 'priority'))}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={styles.sectionLink}>Sort: {sort === 'priority' ? 'Priority' : 'Time'}</Text>
              </Pressable>
            </View>
            {todayTasks.length ? (
              <View style={styles.list}>{renderCards(todayTasks)}</View>
            ) : (
              <Text style={styles.empty}>Nothing planned for today. Tap + to add a task.</Text>
            )}
            {totalToday > 0 && (
              <View style={styles.rhythm}>
                <View style={styles.ring}>
                  <Svg width={64} height={64} viewBox="0 0 84 84">
                    <Circle cx={42} cy={42} r={36} stroke="rgba(255,255,255,0.14)" strokeWidth={8} fill="none" />
                    <Circle
                      cx={42}
                      cy={42}
                      r={36}
                      stroke="#7DB9A1"
                      strokeWidth={8}
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 36}`}
                      strokeDashoffset={2 * Math.PI * 36 * (1 - percent / 100)}
                      transform="rotate(-90 42 42)"
                    />
                  </Svg>
                  <Text style={styles.ringText}>{percent}%</Text>
                </View>
                <View style={styles.rhythmBody}>
                  <Text style={styles.rhythmLabel}>TODAY’S RHYTHM</Text>
                  <Text style={styles.rhythmNote}>
                    {doneToday === totalToday ? 'All done for today. Nice work!' : `${totalToday - doneToday} left to go today.`}
                  </Text>
                </View>
              </View>
            )}
          </>
        ) : (
          <>
            {sections.slice(0, 4).map((section) =>
              section.tasks.length ? (
                <View key={section.key}>
                  <View style={styles.sectionHeading}>
                    <Text style={styles.sectionLabel}>{section.title}</Text>
                    <Count value={section.tasks.length} />
                  </View>
                  <View style={styles.list}>{renderCards(section.tasks, selection.kind === 'all')}</View>
                </View>
              ) : null,
            )}
            {openCount === 0 && <Text style={[styles.empty, styles.emptyDetail]}>No open tasks. Tap + to add one.</Text>}
            {completed.length > 0 && (
              <>
                <Pressable
                  onPress={() => setShowCompleted((open) => !open)}
                  style={styles.sectionHeading}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showCompleted }}
                >
                  <Text style={styles.sectionLabel}>Completed · {completed.length}</Text>
                  <Text style={styles.sectionLink}>{showCompleted ? 'Hide' : 'Show'}</Text>
                </Pressable>
                {showCompleted && <View style={styles.list}>{renderCards(completed, selection.kind === 'all')}</View>}
              </>
            )}
          </>
        )}
      </>
    );
  }

  function renderOverview() {
    return (
      <>
        <PageHeader
          session={session}
          title="To-do"
          actions={
            <>
              <RoundButton icon="calendar-outline" label="Task calendar" size={36} iconSize={19} onPress={() => router.push('/task-calendar')} />
              <RoundButton icon="options-outline" label="Manage tasks" size={36} iconSize={19} onPress={() => router.push('/tasks')} />
            </>
          }
        />

        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.textSubtle} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search"
            placeholderTextColor={colors.textSubtle}
            returnKeyType="search"
            style={styles.searchInput}
            accessibilityLabel="Search tasks"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.textSubtle} />
            </Pressable>
          )}
        </View>

        {query ? (
          <>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionLabel}>Results</Text>
              <Count value={results.length} />
            </View>
            {results.length ? (
              <View style={styles.list}>{renderCards(results)}</View>
            ) : (
              <Text style={styles.empty}>No tasks match “{search.trim()}”.</Text>
            )}
          </>
        ) : (
          <>
            <View style={styles.smartRow}>
              <SmartCard
                icon="today-outline"
                color={colors.primary}
                label="Today"
                count={totalToday - doneToday}
                onPress={() => openList({ kind: 'today' })}
              />
              <SmartCard
                icon="file-tray-outline"
                color={colors.textMuted}
                label="All"
                count={allOpen}
                onPress={() => openList({ kind: 'all' })}
              />
            </View>

            <Text style={styles.groupLabel}>My lists</Text>
            <View style={styles.group}>
              {lists.map((item, index) => (
                <ListRow
                  key={item.name}
                  item={item}
                  bordered={index > 0}
                  onOpen={(name) => openList({ kind: 'list', name })}
                  onDelete={confirmDeleteList}
                />
              ))}
              {newListOpen ? (
                <View style={[styles.listRow, styles.listRowBorder]}>
                  <View style={[styles.listIcon, { backgroundColor: listColor(newListName.trim() || 'New') ?? colors.primary }]}>
                    <Ionicons name="list-outline" size={15} color="#FFFFFF" />
                  </View>
                  <TextInput
                    value={newListName}
                    onChangeText={setNewListName}
                    placeholder="List name"
                    placeholderTextColor={colors.textSubtle}
                    maxLength={60}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={createList}
                    style={styles.newListInput}
                    accessibilityLabel="New list name"
                  />
                  <Pressable onPress={createList} disabled={!newListName.trim()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Save list">
                    <Ionicons name="checkmark-circle" size={24} color={newListName.trim() ? colors.primary : colors.textSubtle} />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setNewListOpen(false);
                      setNewListName('');
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel new list"
                  >
                    <Ionicons name="close-circle" size={24} color={colors.textSubtle} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => setNewListOpen(true)}
                  style={({ pressed }) => [styles.listRow, styles.listRowBorder, pressed && styles.rowPressed]}
                  accessibilityRole="button"
                >
                  <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
                  <Text style={styles.newListText}>New list</Text>
                </Pressable>
              )}
            </View>
            {undo && (
              <Pressable onPress={() => void run(undoTaskAction)} hitSlop={8} style={styles.undo} accessibilityRole="button">
                <Ionicons name="arrow-undo-outline" size={15} color={colors.textMuted} />
                <Text style={styles.undoText} numberOfLines={1}>Undo: {undo}</Text>
              </Pressable>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {selection ? renderListDetail() : renderOverview()}
        {(error || actionError) && <Text style={styles.error}>{error ?? actionError}</Text>}
      </ScrollView>
      <Pressable
        onPress={addTask}
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={selection?.kind === 'list' ? `Add task to ${selectionTitle}` : 'Add new task'}
      >
        <Ionicons name="add" size={30} color={colors.onPrimary} />
      </Pressable>
    </SafeAreaView>
  );
}

function ListRow({
  item,
  bordered,
  onOpen,
  onDelete,
}: {
  item: TodoListSummary;
  bordered: boolean;
  onOpen: (name: string) => void;
  onDelete: (name: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onOpen(item.name)}
      onLongPress={() => {
        if (!item.isDefault) onDelete(item.name);
      }}
      style={({ pressed }) => [styles.listRow, bordered && styles.listRowBorder, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.open} open`}
      accessibilityHint={item.isDefault ? undefined : 'Long press to delete this list'}
    >
      <View style={[styles.listIcon, { backgroundColor: item.color }]}>
        <Ionicons name={item.icon as React.ComponentProps<typeof Ionicons>['name']} size={15} color="#FFFFFF" />
      </View>
      <Text style={styles.listName} numberOfLines={1}>{item.name}</Text>
      <Text style={styles.listCount}>{item.open}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
    </Pressable>
  );
}

function SmartCard({
  icon,
  color,
  label,
  count,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  label: string;
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.smartCard, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${count} open`}
    >
      <View style={styles.smartTop}>
        <View style={[styles.listIcon, { backgroundColor: color }]}>
          <Ionicons name={icon} size={15} color="#FFFFFF" />
        </View>
        <Text style={styles.smartCount}>{count}</Text>
      </View>
      <Text style={styles.smartLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: spacing.md,
    paddingBottom: 130,
  },
  pressed: { opacity: 0.75 },
  fade: { opacity: 0.6 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 42,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: spacing.sm },
  smartRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  smartCard: {
    flex: 1,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smartTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smartCount: { color: colors.text, fontSize: 24, fontWeight: '700' },
  smartLabel: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  groupLabel: { color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3, marginTop: spacing.xl, marginBottom: spacing.sm },
  group: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.md },
  listRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  listIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  listIconLarge: { width: 36, height: 36, borderRadius: 18 },
  listName: { flex: 1, minWidth: 0, color: colors.text, fontSize: 16 },
  listCount: { color: colors.textMuted, fontSize: 15 },
  newListText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  newListInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 16, paddingVertical: spacing.sm },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: spacing.lg },
  undoText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: 36, marginLeft: -6 },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  detailHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  detailTitle: { flex: 1, minWidth: 0, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  detailCount: { color: colors.textMuted, fontSize: 22, fontWeight: '600' },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  sectionLink: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  count: {
    minWidth: 28,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  countText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  list: { gap: spacing.md },
  empty: { color: colors.textMuted, fontSize: 14 },
  emptyDetail: { marginTop: spacing.xl },
  task: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  taskDone: { backgroundColor: colors.surfaceAlt },
  check: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  checkDone: { backgroundColor: '#6FA08D', borderColor: '#6FA08D' },
  taskBody: { flex: 1, minWidth: 0 },
  taskTitle: { color: colors.text, fontSize: 17, fontWeight: '500' },
  strike: { color: colors.textSubtle, textDecorationLine: 'line-through' },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  taskSubtitle: { flexShrink: 1, color: colors.textSubtle, fontSize: 12 },
  taskTime: { color: colors.text, fontSize: 13, fontWeight: '700' },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  pillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  rhythm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    marginTop: spacing.xl,
    padding: spacing.xl,
    borderRadius: 28,
    backgroundColor: RHYTHM_CARD,
  },
  ring: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  ringText: { position: 'absolute', color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  rhythmBody: { flex: 1, gap: 4 },
  rhythmLabel: { color: '#8FB8A8', fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  rhythmNote: { color: '#93A39B', fontSize: 13 },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.lg },
  fab: {
    position: 'absolute',
    right: 22,
    bottom: 38,
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 29,
    backgroundColor: colors.heroBackground,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
}));

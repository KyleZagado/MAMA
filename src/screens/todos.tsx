import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { ProfileButton } from '../components/profile-button';
import { Chip, ChipRow } from '../components/form';
import { PickerField } from '../components/picker-field';
import { lightColors as colors, MAX_CONTENT_WIDTH, radius, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import { addTodo, setTodoDone, undoTaskAction, type Todo } from '../database/todos';
import { useTodos } from '../hooks/use-todos';
import {
  addDaysToKey,
  formatDateKey,
  formatTimeKey,
  timeKeyToDate,
  toDateKey,
  toTimeKey,
} from '../lib/dates';

type SortMode = 'priority' | 'time';

const PRIORITIES: { id: 'high' | 'medium' | 'low'; label: string; background: string; color: string }[] = [
  { id: 'high', label: 'HIGH', background: '#F8E4E0', color: '#B3443A' },
  { id: 'medium', label: 'MEDIUM', background: '#F8EBDD', color: '#A86A2A' },
  { id: 'low', label: 'LOW', background: '#E6F1EA', color: '#5D7F6E' },
];
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

const CATEGORIES = [
  { id: 'Work', color: '#2F6F5B' },
  { id: 'Personal', color: '#B5763A' },
  { id: 'Household', color: '#C79B6F' },
  { id: 'Health', color: '#8A6FB3' },
];

const RHYTHM_CARD = '#1B2420';
const WEEK_PREVIEW = 3;
const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

function categoryColor(category: string | null) {
  return CATEGORIES.find((item) => item.id === category)?.color ?? colors.textSubtle;
}

function greeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstName(session: Session) {
  const name = session.user.user_metadata?.display_name;
  return typeof name === 'string' && name.trim()
    ? name.trim().split(/\s+/)[0]
    : (session.user.email?.split('@')[0] ?? 'there');
}

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
          <View style={[styles.dot, { backgroundColor: todo.color ?? categoryColor(todo.category) }]} />
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

export function Todos({ session }: { session: Session }) {
  const { todos, error, reload, undo, isLoading } = useTodos(session.user.id);
  const busy = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('priority');
  const [showAllWeek, setShowAllWeek] = useState(false);

  const [title, setTitle] = useState('');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [dueDate, setDueDate] = useState(() => new Date());
  const [time, setTime] = useState<Date | null>(null);
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [category, setCategory] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const todayKey = toDateKey(new Date());
  const weekEndKey = addDaysToKey(todayKey, 6);
  const query = search.trim().toLowerCase();

  const groups = useMemo(() => {
    const comparator = sort === 'priority' ? byPriorityThenTime : byTimeThenPriority;
    const today = todos
      .filter((t) => t.due_date === todayKey || (t.due_date < todayKey && t.status !== 'done'))
      .sort(comparator);
    const week = todos
      .filter((t) => t.due_date > todayKey && t.due_date <= weekEndKey)
      .sort(byDateThenTime);
    const later = todos.filter((t) => t.due_date > weekEndKey).sort(byDateThenTime);
    const results = query
      ? todos
          .filter((t) => `${t.title} ${t.category ?? ''} ${t.notes ?? ''} ${t.tags.join(' ')}`.toLowerCase().includes(query))
          .sort(byDateThenTime)
      : [];
    return { today, week, later, results };
  }, [todos, sort, todayKey, weekEndKey, query]);

  const doneToday = groups.today.filter((t) => t.status === 'done').length;
  const totalToday = groups.today.length;
  const percent = totalToday ? Math.round((doneToday / totalToday) * 100) : 0;

  function subtitleFor(todo: Todo) {
    const label = todo.category ?? 'Task';
    if (todo.due_date === todayKey) return todo.notes ? `${label} · ${todo.notes}` : label;
    if (todo.due_date < todayKey) return `Overdue · ${label}`;
    const day =
      todo.due_date <= weekEndKey
        ? formatDateKey(todo.due_date, 'weekday')
        : formatDateKey(todo.due_date, 'short');
    return `${day} · ${label}`;
  }

  async function run(action: (db: Awaited<ReturnType<typeof getDatabase>>) => Promise<unknown>) {
    if (busy.current || isLoading) return false;
    busy.current = true;
    setIsSaving(true);
    try {
      setActionError(null);
      await action(await getDatabase(session.user.id));
      await reload();
      return true;
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Something went wrong.');
      return false;
    } finally {
      busy.current = false;
      setIsSaving(false);
    }
  }

  function handleAdd() {
    const trimmed = title.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    run((db) =>
      addTodo(db, {
        title: trimmed,
        priority,
        category,
        dueDate: toDateKey(dueDate),
        startTime: time ? toTimeKey(time) : null,
      }),
    ).then((saved) => {
      if (!saved) return;
      setTitle('');
      setDueDate(new Date());
      setTime(null);
      setPriority('medium');
      setCategory(null);
      setOptionsOpen(false);
    });
  }

  function openMenu(todo: Todo) {
    router.push({ pathname: '/task-form', params: { id: todo.id } });
  }

  function renderCards(list: Todo[]) {
    return list.map((todo) => (
      <TaskCard
        key={todo.id}
        todo={todo}
        subtitle={subtitleFor(todo)}
        onToggle={() => run((db) => setTodoDone(db, todo.id, todo.status !== 'done'))}
        onMenu={() => openMenu(todo)}
      />
    ));
  }

  const now = new Date();
  const weekVisible = showAllWeek ? groups.week : groups.week.slice(0, WEEK_PREVIEW);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={styles.date}>
            <Text style={styles.weekday}>
              {now.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()}
            </Text>
            {'  •  '}
            {now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </Text>
          <ProfileButton session={session} />
        </View>
        <Text style={styles.greeting}>
          {greeting(now.getHours())}, {firstName(session)}
        </Text>
        <ChipRow>
          <Chip label="New detailed task" selected={false} onPress={() => router.push('/task-form')} />
          <Chip label="Manage tasks / Bulk / Drag" selected={false} onPress={() => router.push('/tasks')} />
          {undo && <Chip label={`Undo: ${undo}`} selected={false} onPress={() => void run(undoTaskAction)} />}
        </ChipRow>

        <View style={styles.search}>
          <Ionicons name="search" size={20} color={colors.textSubtle} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search tasks"
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

        <View style={styles.composer}>
          <View style={styles.composerRow}>
            <View style={styles.plus}>
              <Ionicons name="add" size={24} color={colors.primary} />
            </View>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Add a task, reminder, or note…"
              placeholderTextColor={colors.textSubtle}
              maxLength={120}
              returnKeyType="done"
              onSubmitEditing={handleAdd}
              style={styles.composerInput}
              accessibilityLabel="New task"
            />
            <Pressable
              onPress={() => setOptionsOpen((open) => !open)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Task options"
              accessibilityState={{ expanded: optionsOpen }}
            >
              <Ionicons
                name={optionsOpen ? 'calendar' : 'calendar-outline'}
                size={24}
                color={optionsOpen ? colors.primary : colors.textMuted}
              />
            </Pressable>
            <Pressable
              onPress={handleAdd}
              disabled={!title.trim() || isSaving || isLoading}
              style={({ pressed }) => [
                styles.addButton,
                !title.trim() && styles.disabled,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.addText}>{isSaving ? 'Saving...' : 'Add task'}</Text>
            </Pressable>
          </View>

          {optionsOpen && (
            <View style={styles.options}>
              <View style={styles.optionRow}>
                <Text style={styles.optionLabel}>Date</Text>
                <PickerField mode="date" value={dueDate} onChange={setDueDate} />
              </View>
              <View style={styles.optionRow}>
                <Text style={styles.optionLabel}>Time</Text>
                {time ? (
                  <View style={styles.timeRow}>
                    <PickerField mode="time" value={time} onChange={setTime} />
                    <Pressable onPress={() => setTime(null)} hitSlop={8} accessibilityLabel="Remove time">
                      <Ionicons name="close-circle" size={20} color={colors.textSubtle} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setTime(timeKeyToDate('09:00'))}
                    style={styles.pickerButton}
                    accessibilityRole="button"
                  >
                    <Text style={styles.pickerText}>Add time</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.chips}>
                {PRIORITIES.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => setPriority(item.id)}
                    style={[
                      styles.chip,
                      priority === item.id && { backgroundColor: item.background, borderColor: item.color },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: priority === item.id }}
                  >
                    <Text style={[styles.chipText, priority === item.id && { color: item.color }]}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.chips}>
                {CATEGORIES.map((item) => {
                  const selected = category === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setCategory(selected ? null : item.id)}
                      style={[styles.chip, selected && styles.chipSelected]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <View style={[styles.dot, { backgroundColor: item.color }]} />
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{item.id}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        {query ? (
          <>
            <View style={styles.sectionHeading}>
              <View style={styles.sectionLeft}>
                <Text style={styles.sectionTitle}>Results</Text>
                <Count value={groups.results.length} />
              </View>
            </View>
            {groups.results.length ? (
              <View style={styles.list}>{renderCards(groups.results)}</View>
            ) : (
              <Text style={styles.empty}>No tasks match “{search.trim()}”.</Text>
            )}
          </>
        ) : (
          <>
            <View style={styles.sectionHeading}>
              <View style={styles.sectionLeft}>
                <Text style={styles.sectionTitle}>Today</Text>
                <Count value={totalToday} />
              </View>
              <Pressable
                onPress={() => setSort((mode) => (mode === 'priority' ? 'time' : 'priority'))}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={styles.sectionLink}>Sort: {sort === 'priority' ? 'Priority' : 'Time'}</Text>
              </Pressable>
            </View>
            {groups.today.length ? (
              <View style={styles.list}>{renderCards(groups.today)}</View>
            ) : (
              <Text style={styles.empty}>Nothing planned for today. Add a task above.</Text>
            )}

            {groups.week.length > 0 && (
              <>
                <View style={styles.sectionHeading}>
                  <View style={styles.sectionLeft}>
                    <Text style={styles.sectionTitle}>Later this week</Text>
                    <Count value={groups.week.length} />
                  </View>
                  {groups.week.length > WEEK_PREVIEW && (
                    <Pressable onPress={() => setShowAllWeek((v) => !v)} hitSlop={8} accessibilityRole="button">
                      <Text style={styles.sectionLink}>{showAllWeek ? 'Show less' : 'View all'}</Text>
                    </Pressable>
                  )}
                </View>
                <View style={styles.list}>{renderCards(weekVisible)}</View>
              </>
            )}

            {groups.later.length > 0 && (
              <>
                <View style={styles.sectionHeading}>
                  <View style={styles.sectionLeft}>
                    <Text style={styles.sectionTitle}>Later</Text>
                    <Count value={groups.later.length} />
                  </View>
                </View>
                <View style={styles.list}>{renderCards(groups.later)}</View>
              </>
            )}

            <View style={styles.rhythm}>
              <View style={styles.ring}>
                <Svg width={84} height={84} viewBox="0 0 84 84">
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
                <Text style={styles.rhythmTitle}>
                  {doneToday} of {totalToday} tasks completed
                </Text>
                <Text style={styles.rhythmNote}>
                  {totalToday === 0
                    ? 'Nothing scheduled for today yet.'
                    : doneToday === totalToday
                      ? 'All done for today. Nice work!'
                      : `${totalToday - doneToday} left to go today.`}
                </Text>
              </View>
            </View>
          </>
        )}

        {(error || actionError) && <Text style={styles.error}>{error ?? actionError}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: spacing.md,
    paddingBottom: 56,
  },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
  fade: { opacity: 0.6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  date: { flex: 1, color: colors.textMuted, fontSize: 15 },
  weekday: { color: colors.primary, fontWeight: '800', letterSpacing: 0.6 },
  greeting: {
    color: colors.text,
    fontFamily: SERIF,
    fontSize: 36,
    lineHeight: 44,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: spacing.md },
  composer: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 24,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  plus: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
  },
  composerInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 15, paddingVertical: spacing.sm },
  addButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  addText: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
  options: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionLabel: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pickerButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  pickerText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  chipTextSelected: { color: colors.primary },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  sectionLink: { color: colors.primary, fontSize: 15, fontWeight: '600' },
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
  taskDone: { backgroundColor: '#F4F6F3' },
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
  ring: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  ringText: { position: 'absolute', color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  rhythmBody: { flex: 1, gap: 4 },
  rhythmLabel: { color: '#8FB8A8', fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  rhythmTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '600' },
  rhythmNote: { color: '#93A39B', fontSize: 13 },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.lg },
});

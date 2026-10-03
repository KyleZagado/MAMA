import type { Session } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { Link, router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, ChipRow, FieldLabel, formStyles, PrimaryButton } from '../components/form';
import { PickerField } from '../components/picker-field';
import { goBack, ScreenHeader } from '../components/screen-header';
import { TASK_CATEGORIES, TASK_COLORS, TASK_PRIORITIES, TASK_STATUSES } from '../constants/tasks';
import { lightColors as colors, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import {
  changeTodos, duplicateTodo, getTodo, saveTodo, type ChecklistItem, type Todo,
  type TodoInput, type TodoPriority, type TodoStatus, validateTodo,
} from '../database/todos';
import { fromDateKey, timeKeyToDate, toDateKey, toTimeKey } from '../lib/dates';
import { removeStoredPhoto, storedPhotoUri, storePhoto } from '../lib/stored-photos';

type Photo = { name: string; uri: string; persisted: boolean };

export function TaskForm({ session, taskId, initialDate }: {
  session: Session; taskId?: string; initialDate?: string;
}) {
  const [original, setOriginal] = useState<Todo | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(() => initialDate ? fromDateKey(initialDate) : new Date());
  const [dueTime, setDueTime] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [allDay, setAllDay] = useState(true);
  const [priority, setPriority] = useState<TodoPriority>('medium');
  const [status, setStatus] = useState<TodoStatus>('todo');
  const [subtasks, setSubtasks] = useState<ChecklistItem[]>([]);
  const [checklistTitle, setChecklistTitle] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [links, setLinks] = useState('');
  const [tags, setTags] = useState('');
  const [category, setCategory] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [estimate, setEstimate] = useState('');
  const [actual, setActual] = useState('');
  const [isLoading, setIsLoading] = useState(Boolean(taskId));
  const [isSaving, setIsSaving] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!taskId) return;
    let active = true;
    (async () => {
      try {
        const todo = await getTodo(await getDatabase(session.user.id), taskId);
        if (!todo) throw new Error('This task is no longer available.');
        if (!active) return;
        setOriginal(todo);
        setTitle(todo.title);
        setNotes(todo.notes ?? '');
        setDueDate(fromDateKey(todo.due_date));
        setDueTime(todo.due_time);
        setStartTime(todo.start_time);
        setEndTime(todo.end_time);
        setAllDay(Boolean(todo.all_day));
        setPriority(todo.priority);
        setStatus(todo.status);
        setSubtasks(todo.subtasks);
        setPhotos(todo.photos.map((name) => ({ name, uri: storedPhotoUri('task-photos', name), persisted: true })));
        setLinks(todo.links.join('\n'));
        setTags(todo.tags.join(', '));
        setCategory(todo.category ?? '');
        setColor(todo.color);
        setLocation(todo.location ?? '');
        setEstimate(todo.estimated_minutes == null ? '' : String(todo.estimated_minutes));
        setActual(todo.actual_minutes == null ? '' : String(todo.actual_minutes));
      } catch (e: unknown) {
        if (active) setError(e instanceof Error ? e.message : 'Could not load this task.');
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [taskId, session.user.id]);

  async function pickPhoto(source: 'camera' | 'library') {
    if (busy.current || isPicking) return;
    setIsPicking(true);
    setError(null);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error('Allow camera access in Settings to attach a photo.');
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsEditing: false };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled) {
        const asset = result.assets[0];
        setPhotos((current) => [...current, { name: randomUUID(), uri: asset.uri, persisted: false }]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not attach a photo.');
    } finally {
      setIsPicking(false);
    }
  }

  async function save() {
    if (busy.current || isPicking || isLoading || (taskId && !original)) return;
    busy.current = true;
    setIsSaving(true);
    setError(null);
    const copied: string[] = [];
    let saved = false;
    try {
      const duration = (value: string) => {
        if (!value.trim()) return null;
        if (!/^\d+$/.test(value.trim())) throw new Error('Durations must be whole minutes, zero or greater.');
        return Number(value);
      };
      if (checklistTitle.trim()) throw new Error('Add your pending checklist item or clear it before saving.');
      const input: TodoInput = {
        title, notes, dueDate: toDateKey(dueDate), startTime, dueTime, endTime, allDay,
        priority, status, subtasks, photos: [], links: links.split('\n').map((link) => link.trim()).filter(Boolean),
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), category: category || null,
        color, location, estimatedMinutes: duration(estimate), actualMinutes: duration(actual),
      };
      validateTodo(input);
      input.photos = photos.map((photo) => {
        if (photo.persisted) return photo.name;
        const name = storePhoto('task-photos', photo.uri);
        copied.push(name);
        return name;
      });
      await saveTodo(await getDatabase(session.user.id), input, taskId, original?.updated_at);
      saved = true;
    } catch (e: unknown) {
      let message = e instanceof Error ? e.message : 'Could not save this task.';
      for (const name of copied) {
        try { removeStoredPhoto('task-photos', name); } catch (cleanupError: unknown) {
          console.error('Could not remove unsaved task attachment', cleanupError);
          message += ' An unsaved photo could not be cleaned up.';
        }
      }
      setError(message);
    } finally {
      busy.current = false;
      setIsSaving(false);
    }
    if (saved) goBack();
  }

  async function action(type: 'duplicate' | 'archive' | 'delete') {
    if (!taskId || busy.current) return;
    busy.current = true;
    setIsSaving(true);
    setError(null);
    let succeeded = false;
    try {
      const db = await getDatabase(session.user.id);
      if (type === 'duplicate') await duplicateTodo(db, taskId);
      else await changeTodos(db, [taskId], type === 'delete'
        ? { type: 'delete' } : { type: 'archive', archived: !original?.archived_at });
      succeeded = true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not update this task.');
    } finally {
      busy.current = false;
      setIsSaving(false);
    }
    if (succeeded) goBack();
  }

  const disabled = isLoading || isSaving || isPicking || Boolean(taskId && !original);
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader title={taskId ? 'Edit Task' : 'New Task'} />
          {isLoading ? <ActivityIndicator color={colors.primary} /> : (!taskId || original) && (
            <>
              {original?.archived_at != null && <Text style={styles.hint}>Archived task</Text>}
              <FieldLabel>TASK TITLE</FieldLabel>
              <TextInput value={title} onChangeText={setTitle} maxLength={120} style={formStyles.input} placeholder="What needs to be done?" accessibilityLabel="Task title" />
              <FieldLabel>DESCRIPTION / NOTES</FieldLabel>
              <TextInput value={notes} onChangeText={setNotes} multiline maxLength={4000} style={[formStyles.input, styles.multiline]} accessibilityLabel="Task notes" />
              <FieldLabel>DUE DATE</FieldLabel>
              <PickerField mode="date" value={dueDate} onChange={setDueDate} />
              <View style={styles.row}>
                <Text style={styles.hint}>All-day task</Text>
                <Switch value={allDay} onValueChange={setAllDay} accessibilityLabel="All-day task" />
              </View>
              {!allDay && (
                <>
                  <TaskTime label="Due time" value={dueTime} onChange={setDueTime} />
                  <TaskTime label="Start time" value={startTime} onChange={setStartTime} />
                  <TaskTime label="End time" value={endTime} onChange={setEndTime} />
                  <Text style={styles.hint}>Times are local and on the due date; end time must be after start time.</Text>
                </>
              )}
              <FieldLabel>PRIORITY</FieldLabel>
              <ChipRow>{TASK_PRIORITIES.map((item) => <Chip key={item.id} label={item.label} selected={priority === item.id} onPress={() => setPriority(item.id)} />)}</ChipRow>
              <FieldLabel>STATUS</FieldLabel>
              <ChipRow>{TASK_STATUSES.map((item) => <Chip key={item.id} label={item.label} selected={status === item.id} onPress={() => setStatus(item.id)} />)}</ChipRow>
              <FieldLabel>SUBTASKS / CHECKLIST</FieldLabel>
              {subtasks.map((item) => (
                <View key={item.id} style={styles.row}>
                  <Pressable onPress={() => setSubtasks((current) => current.map((task) => task.id === item.id ? { ...task, done: !task.done } : task))}
                    accessibilityRole="checkbox" accessibilityState={{ checked: item.done }} accessibilityLabel={item.title} style={styles.check}>
                    <Text style={styles.hint}>{item.done ? '[x]' : '[ ]'}</Text>
                  </Pressable>
                  <TextInput value={item.title} onChangeText={(value) => setSubtasks((current) => current.map((task) => task.id === item.id ? { ...task, title: value } : task))}
                    maxLength={120} style={[formStyles.input, styles.flex]} accessibilityLabel="Checklist item title" />
                  <Chip label="Remove" selected={false} onPress={() => setSubtasks((current) => current.filter((task) => task.id !== item.id))} />
                </View>
              ))}
              <TextInput value={checklistTitle} onChangeText={setChecklistTitle} maxLength={120} style={formStyles.input} placeholder="New checklist item" accessibilityLabel="New checklist item" />
              <PrimaryButton label="Add checklist item" disabled={!checklistTitle.trim()} onPress={() => {
                setSubtasks((current) => [...current, { id: randomUUID(), title: checklistTitle.trim(), done: false }]);
                setChecklistTitle('');
              }} />
              <FieldLabel>PHOTO ATTACHMENTS</FieldLabel>
              {photos.map((photo) => (
                <TaskPhoto key={photo.name} uri={photo.uri} onRemove={() => setPhotos((current) => current.filter((item) => item.name !== photo.name))} />
              ))}
              <PrimaryButton label={isPicking ? 'Opening picker...' : 'Choose photo'} disabled={isPicking || isSaving} onPress={() => void pickPhoto('library')} />
              <PrimaryButton label="Take photo" disabled={isPicking || isSaving} onPress={() => void pickPhoto('camera')} />
              <FieldLabel>LINKS (ONE HTTP/HTTPS URL PER LINE)</FieldLabel>
              <TextInput value={links} onChangeText={setLinks} multiline autoCapitalize="none" keyboardType="url" style={[formStyles.input, styles.multiline]} accessibilityLabel="Task links" />
              {original?.links.map((url) => <Link key={url} href={url} style={styles.link}>{url}</Link>)}
              <FieldLabel>TAGS (COMMA-SEPARATED)</FieldLabel>
              <TextInput value={tags} onChangeText={setTags} style={formStyles.input} accessibilityLabel="Task tags" />
              <FieldLabel>CATEGORY</FieldLabel>
              <ChipRow>{TASK_CATEGORIES.map((item) => <Chip key={item} label={item} selected={category === item} onPress={() => setCategory(category === item ? '' : item)} />)}</ChipRow>
              <TextInput value={category} onChangeText={setCategory} maxLength={60} style={formStyles.input} placeholder="Or enter your own category" accessibilityLabel="Custom category" />
              <FieldLabel>COLOR LABEL</FieldLabel>
              <ChipRow>
                <Chip label="None" selected={!color} onPress={() => setColor(null)} />
                {TASK_COLORS.map((item) => <Chip key={item.value} label={item.label} selected={color === item.value} onPress={() => setColor(item.value)} />)}
              </ChipRow>
              {color && <View style={[styles.swatch, { backgroundColor: color }]} />}
              <FieldLabel>LOCATION (OPTIONAL)</FieldLabel>
              <TextInput value={location} onChangeText={setLocation} maxLength={200} style={formStyles.input} accessibilityLabel="Task location" />
              <FieldLabel>ESTIMATED DURATION (MINUTES)</FieldLabel>
              <TextInput value={estimate} onChangeText={setEstimate} keyboardType="number-pad" maxLength={7} style={formStyles.input} accessibilityLabel="Estimated minutes" />
              <FieldLabel>ACTUAL TIME SPENT (MINUTES)</FieldLabel>
              <TextInput value={actual} onChangeText={setActual} keyboardType="number-pad" maxLength={7} style={formStyles.input} accessibilityLabel="Actual minutes" />
            </>
          )}
          {error && <Text style={formStyles.error}>{error}</Text>}
          <PrimaryButton label={taskId ? 'Save task changes' : 'Create task'} disabled={disabled} loading={isSaving} onPress={() => void save()} />
          {original && (
            <>
              <Text style={styles.hint}>The actions below use the last saved task. Save your edits first to include them.</Text>
              <PrimaryButton label="Duplicate saved task" disabled={disabled} onPress={() => void action('duplicate')} />
              <PrimaryButton label={original.archived_at ? 'Unarchive task' : 'Archive task'} disabled={disabled} onPress={() => void action('archive')} />
              <PrimaryButton label="Delete task" disabled={disabled} onPress={() => Alert.alert('Delete task?', 'You can undo this in Manage tasks.', [
                { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void action('delete') },
              ])} />
            </>
          )}
          <Chip label="Manage tasks / Undo" selected={false} disabled={isSaving || isPicking} onPress={() => router.push('/tasks')} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TaskTime({ label, value, onChange }: { label: string; value: string | null; onChange: (value: string | null) => void }) {
  return <View style={styles.row}><Text style={styles.hint}>{label}</Text>
    {value ? <>
      <PickerField mode="time" value={timeKeyToDate(value)} onChange={(date) => onChange(toTimeKey(date))} />
      <Chip label="Clear" selected={false} onPress={() => onChange(null)} />
    </> : <Chip label="Set time" selected={false} onPress={() => onChange('09:00')} />}
  </View>;
}

function TaskPhoto({ uri, onRemove }: { uri: string; onRemove: () => void }) {
  const [failed, setFailed] = useState(false);
  return <View style={formStyles.card}>
    <Image source={{ uri }} style={styles.photo} resizeMode="contain" accessibilityLabel="Task attachment" onError={() => setFailed(true)} />
    {failed && <Text style={formStyles.error}>This attachment could not be loaded.</Text>}
    <Chip label="Remove photo" selected={false} onPress={onRemove} />
  </View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'space-between' },
  hint: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  multiline: { minHeight: 100, paddingTop: spacing.md, textAlignVertical: 'top' },
  check: { minWidth: 40, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  photo: { width: '100%', height: 230 }, swatch: { height: 8, borderRadius: 4 },
  link: { color: colors.primary, fontSize: 14, paddingVertical: spacing.sm },
});

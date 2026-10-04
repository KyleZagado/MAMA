import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileButton } from '../components/profile-button';
import { PickerField } from '../components/picker-field';
import { darkColors, MAX_CONTENT_WIDTH, radius, spacing } from '../constants/theme';
import {
  deleteJournalEntry,
  draftFromEntry,
  filterJournalEntries,
  getJournalEntry,
  hasJournalContent,
  JOURNAL_MOODS,
  listJournalEntries,
  loadJournalPreferences,
  saveJournalEntry,
  saveJournalPreferences,
  type JournalDraft,
  type JournalEntry,
  type JournalMood,
} from '../database/journal';
import { getDatabase } from '../database';
import { addDaysToKey, fromDateKey, toDateKey } from '../lib/dates';
import { deleteJournalPhoto, journalPhotoUri, saveJournalPhoto } from '../lib/journal-photos';
import {
  requestJournalReminderPermission,
  syncJournalReminder,
} from '../lib/journal-reminders';
import { createThemedStyleSheet, useTheme } from '../providers/theme-provider';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const SUGGESTED_TAGS = ['Work', 'Family', 'Travel', 'Goals'];

// Apple Notes-inspired palette: grouped gray background, white/black sheets, yellow tint.
function notesPalette(isDark: boolean) {
  return {
    background: isDark ? '#000000' : '#F2F2F7',
    sheet: isDark ? '#1C1C1E' : '#FFFFFF',
    fill: isDark ? 'rgba(118, 118, 128, 0.24)' : 'rgba(118, 118, 128, 0.12)',
    separator: isDark ? '#38383A' : '#C6C6C8',
    label: isDark ? '#FFFFFF' : '#000000',
    secondary: isDark ? 'rgba(235, 235, 245, 0.6)' : 'rgba(60, 60, 67, 0.6)',
    tertiary: isDark ? 'rgba(235, 235, 245, 0.3)' : 'rgba(60, 60, 67, 0.3)',
    accent: isDark ? '#FFD60A' : '#E0A800',
    accentSoft: isDark ? 'rgba(255, 214, 10, 0.18)' : 'rgba(255, 204, 0, 0.18)',
    onAccent: '#000000',
    switchOn: isDark ? '#30D158' : '#34C759',
    danger: isDark ? '#FF453A' : '#FF3B30',
  };
}

function monthRange(year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const from = new Date(start);
  from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  const through = new Date(end);
  through.setDate(through.getDate() + (6 - ((through.getDay() + 6) % 7)));
  return { from: toDateKey(from), through: toDateKey(through) };
}

function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function dateLabel(date: string) {
  return fromDateKey(date).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function timestampLabel(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function timeAsDate(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

function timeFromDate(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function moodLabel(mood: JournalMood | null) {
  return JOURNAL_MOODS.find((item) => item.id === mood)?.label ?? '';
}

export function Journal({ session, isVisible = true }: { session: Session; isVisible?: boolean }) {
  const notes = notesPalette(useTheme().mode === 'dark');
  const today = toDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const selectedDateRef = useRef(today);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const entryRef = useRef<JournalEntry | null>(null);
  const [draft, setDraft] = useState<JournalDraft>(() => draftFromEntry(null));
  const draftRef = useRef(draft);
  const [entryReady, setEntryReady] = useState(false);
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const loadRequestRef = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('Changes save automatically');
  const [error, setError] = useState<string | null>(null);
  const [tagText, setTagText] = useState('');
  const [query, setQuery] = useState('');
  const [moodFilter, setMoodFilter] = useState<JournalMood | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [filterBySelectedDate, setFilterBySelectedDate] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('20:00');
  const [isSavingReminder, setIsSavingReminder] = useState(false);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);

  const range = useMemo(() => monthRange(cursor.year, cursor.month), [cursor]);
  const cells = useMemo(() => {
    const count =
      Math.round(
        (fromDateKey(range.through).getTime() - fromDateKey(range.from).getTime()) / 86_400_000,
      ) + 1;
    return Array.from({ length: count }, (_, index) => addDaysToKey(range.from, index));
  }, [range]);
  const entriesByDate = useMemo(
    () => new Map(entries.map((item) => [item.entry_date, item])),
    [entries],
  );
  const allTags = useMemo(
    () => [...new Set(entries.flatMap((item) => item.tags))].sort((a, b) => a.localeCompare(b)),
    [entries],
  );
  const filteredEntries = useMemo(
    () =>
      filterJournalEntries(entries, {
        query,
        mood: moodFilter,
        tag: tagFilter,
        date: filterBySelectedDate ? selectedDate : null,
        favoritesOnly: showFavoritesOnly,
      }),
    [entries, filterBySelectedDate, moodFilter, query, selectedDate, showFavoritesOnly, tagFilter],
  );
  const shouldShowResults =
    showFavoritesOnly ||
    Boolean(query.trim() || moodFilter || tagFilter || filterBySelectedDate);
  const canEditEntry = entryReady && !isLoading;

  const persistDraft = useCallback(async (date: string, snapshot: JournalDraft, revision: number) => {
    const operation = async () => {
      const db = await getDatabase(session.user.id);
      const previous = await getJournalEntry(db, date);
      let saved: JournalEntry | null;
      if (hasJournalContent(snapshot)) {
        saved = await saveJournalEntry(db, date, snapshot);
      } else {
        if (previous) await deleteJournalEntry(db, date);
        saved = null;
      }
      if (previous) {
        for (const photo of previous.photos) {
          if (!snapshot.photos.includes(photo)) deleteJournalPhoto(photo);
        }
      }
      const nextEntries = await listJournalEntries(db);
      setEntries(nextEntries);
      if (date === selectedDateRef.current && revision === revisionRef.current) {
        entryRef.current = saved;
        setEntry(saved);
        const nextDraft = draftFromEntry(saved);
        draftRef.current = nextDraft;
        setDraft(nextDraft);
        dirtyRef.current = false;
        setEntryReady(true);
        setSaveStatus('Saved');
      }
      setError(null);
    };
    const pending = saveQueueRef.current.then(operation, operation);
    saveQueueRef.current = pending.catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Could not save this journal entry.');
      setSaveStatus('Save failed. Try editing again.');
    });
    await saveQueueRef.current;
  }, [session.user.id]);

  const flushCurrentDraft = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (dirtyRef.current) {
      await persistDraft(
        selectedDateRef.current,
        { ...draftRef.current, photos: [...draftRef.current.photos], tags: [...draftRef.current.tags] },
        revisionRef.current,
      );
    } else {
      await saveQueueRef.current;
    }
  }, [persistDraft]);

  function updateDraft(update: Partial<JournalDraft>) {
    if (!canEditEntry) return;
    const next = { ...draftRef.current, ...update };
    draftRef.current = next;
    setDraft(next);
    setError(null);
    revisionRef.current += 1;
    dirtyRef.current = true;
    setSaveStatus('Saving…');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const date = selectedDateRef.current;
    const revision = revisionRef.current;
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persistDraft(date, { ...next, photos: [...next.photos], tags: [...next.tags] }, revision);
    }, 650);
  }

  const loadEntryForDate = useCallback(async (date: string) => {
    const token = ++loadRequestRef.current;
    setIsLoading(true);
    setEntryReady(false);
    try {
      const found = await getJournalEntry(await getDatabase(session.user.id), date);
      if (token !== loadRequestRef.current) return;
      entryRef.current = found;
      setEntry(found);
      const nextDraft = draftFromEntry(found);
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      dirtyRef.current = false;
      setSaveStatus('Changes save automatically');
      setError(null);
    } catch (cause: unknown) {
      if (token === loadRequestRef.current) {
        setError(cause instanceof Error ? cause.message : 'Could not load this journal entry.');
      }
    } finally {
      if (token === loadRequestRef.current) setIsLoading(false);
    }
  }, [session.user.id]);

  async function selectDate(date: string) {
    if (date === selectedDateRef.current) return;
    await flushCurrentDraft();
    if (dirtyRef.current) return;
    selectedDateRef.current = date;
    setSelectedDate(date);
    entryRef.current = null;
    setEntry(null);
    const emptyDraft = draftFromEntry(null);
    draftRef.current = emptyDraft;
    setDraft(emptyDraft);
    dirtyRef.current = false;
    const target = fromDateKey(date);
    setCursor({ year: target.getFullYear(), month: target.getMonth() });
    await loadEntryForDate(date);
  }

  useEffect(() => {
    if (!isVisible) {
      void flushCurrentDraft();
      return;
    }
    let mounted = true;
    async function load() {
      setIsLoading(true);
      try {
        await flushCurrentDraft();
        const db = await getDatabase(session.user.id);
        const [loaded, preferences] = await Promise.all([
          listJournalEntries(db),
          loadJournalPreferences(db),
        ]);
        if (!mounted) return;
        setEntries(loaded);
        setReminderEnabled(preferences.reminder_enabled === 1);
        setReminderTime(preferences.reminder_time);
        const reminder = await syncJournalReminder(
          preferences.reminder_enabled === 1,
          preferences.reminder_time,
        );
        if (!mounted) return;
        setReminderMessage(
          preferences.reminder_enabled === 1
            ? !reminder.supported
              ? Platform.OS === 'android'
                ? 'Daily reminders require an Android development build; they are unavailable in Expo Go.'
                : 'Daily reminders are not available on this platform.'
              : !reminder.permissionGranted
                ? 'Allow notifications in device settings to receive your journal reminder.'
                : null
            : null,
        );
        await loadEntryForDate(selectedDateRef.current);
      } catch (cause: unknown) {
        if (mounted) {
          setError(cause instanceof Error ? cause.message : 'Could not load your journal.');
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
      loadRequestRef.current += 1;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      void flushCurrentDraft();
    };
  }, [flushCurrentDraft, isVisible, loadEntryForDate, session.user.id]);

  function changeMonth(delta: number) {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  }

  function addTag(value: string) {
    if (!canEditEntry) return;
    const tag = value.trim().replace(/^#/, '');
    if (!tag) return;
    if (draftRef.current.tags.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase())) {
      setTagText('');
      return;
    }
    updateDraft({ tags: [...draftRef.current.tags, tag] });
    setTagText('');
  }

  async function addPhotos(source: 'camera' | 'library') {
    try {
      if (!canEditEntry) return;
      setError(null);
      const remaining = 5 - draftRef.current.photos.length;
      if (remaining < 1) {
        setError('A journal entry can contain up to five photos.');
        return;
      }
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(`Allow ${source === 'camera' ? 'camera' : 'photo library'} access to add photos.`);
        return;
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.8,
        ...(source === 'library'
          ? { allowsMultipleSelection: true, selectionLimit: remaining }
          : { allowsEditing: true, aspect: [4, 3] }),
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.length) return;
      const savedPhotos: string[] = [];
      try {
        for (const asset of result.assets.slice(0, remaining)) {
          savedPhotos.push(await saveJournalPhoto(asset.uri));
        }
      } catch (cause: unknown) {
        for (const photo of savedPhotos) deleteJournalPhoto(photo);
        throw cause;
      }
      updateDraft({ photos: [...draftRef.current.photos, ...savedPhotos] });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not add journal photos.');
    }
  }

  function choosePhotoSource() {
    Alert.alert('Add photos', 'Entries can include up to five photos.', [
      { text: 'Choose from library', onPress: () => void addPhotos('library') },
      { text: 'Take a photo', onPress: () => void addPhotos('camera') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function toggleReminder(enabled: boolean) {
    setIsSavingReminder(true);
    setReminderMessage(null);
    try {
      if (enabled) {
        const permission = await requestJournalReminderPermission();
        if (!permission.supported) {
          setReminderMessage(
            Platform.OS === 'android'
              ? 'Daily reminders require an Android development build; they are unavailable in Expo Go.'
              : 'Daily reminders are not available on this platform.',
          );
          return;
        }
        if (!permission.permissionGranted) {
          setReminderMessage('Notification permission is needed to set a daily journal reminder.');
          return;
        }
      }
      const result = await syncJournalReminder(enabled, reminderTime);
      if (enabled && !result.permissionGranted) {
        setReminderMessage('Allow notifications in device settings to receive your journal reminder.');
        return;
      }
      await saveJournalPreferences(await getDatabase(session.user.id), enabled, reminderTime);
      setReminderEnabled(enabled);
      setReminderMessage(null);
    } catch (cause: unknown) {
      setReminderMessage(cause instanceof Error ? cause.message : 'Could not update your reminder.');
    } finally {
      setIsSavingReminder(false);
    }
  }

  async function changeReminderTime(date: Date) {
    const nextTime = timeFromDate(date);
    setIsSavingReminder(true);
    setReminderMessage(null);
    try {
      if (reminderEnabled) {
        const result = await syncJournalReminder(true, nextTime);
        if (!result.supported) {
          setReminderMessage(
            Platform.OS === 'android'
              ? 'Daily reminders require an Android development build; they are unavailable in Expo Go.'
              : 'Daily reminders are not available on this platform.',
          );
          return;
        }
        if (!result.permissionGranted) {
          setReminderMessage('Allow notifications in device settings to receive your journal reminder.');
          return;
        }
      }
      await saveJournalPreferences(
        await getDatabase(session.user.id),
        reminderEnabled,
        nextTime,
      );
      setReminderTime(nextTime);
    } catch (cause: unknown) {
      setReminderMessage(cause instanceof Error ? cause.message : 'Could not update reminder time.');
    } finally {
      setIsSavingReminder(false);
    }
  }

  function confirmDeleteEntry() {
    if (!entryRef.current) return;
    Alert.alert('Delete this journal entry?', 'This also removes its saved photos.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void removeEntry(),
      },
    ]);
  }

  async function removeEntry() {
    try {
      await flushCurrentDraft();
      if (dirtyRef.current) return;
      const db = await getDatabase(session.user.id);
      const target = await getJournalEntry(db, selectedDateRef.current);
      if (!target) return;
      await deleteJournalEntry(db, target.entry_date);
      for (const photo of target.photos) deleteJournalPhoto(photo);
      const nextDraft = draftFromEntry(null);
      entryRef.current = null;
      setEntry(null);
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      setEntries((current) => current.filter((item) => item.entry_date !== target.entry_date));
      dirtyRef.current = false;
      setSaveStatus('Changes save automatically');
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not delete this journal entry.');
    }
  }

  const selectedEntry = entriesByDate.get(selectedDate) ?? entry;
  const selectedDateKey = selectedDate;
  const currentDate = fromDateKey(selectedDate);
  const visibleEntries = shouldShowResults ? filteredEntries : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.brand}>mama</Text>
              <Text style={styles.title}>Journal</Text>
            </View>
            <ProfileButton session={session} />
          </View>

          <View style={styles.filtersCard}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={17} color={notes.secondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                placeholderTextColor={notes.secondary}
                style={styles.searchInput}
                returnKeyType="search"
                accessibilityLabel="Search journal entries"
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search">
                  <Ionicons name="close-circle" size={17} color={notes.secondary} />
                </Pressable>
              )}
            </View>
            <View style={styles.filterRow}>
              <FilterButton
                label="All entries"
                selected={!showFavoritesOnly}
                onPress={() => setShowFavoritesOnly(false)}
              />
              <FilterButton
                label="★ Favorites"
                selected={showFavoritesOnly}
                onPress={() => setShowFavoritesOnly(true)}
              />
              <FilterButton
                label="Selected date"
                selected={filterBySelectedDate}
                onPress={() => setFilterBySelectedDate((value) => !value)}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
              <FilterButton
                label="Any mood"
                selected={moodFilter === null}
                onPress={() => setMoodFilter(null)}
              />
              {JOURNAL_MOODS.map((mood) => (
                <FilterButton
                  key={mood.id}
                  label={`${mood.emoji} ${mood.label}`}
                  selected={moodFilter === mood.id}
                  onPress={() => setMoodFilter(moodFilter === mood.id ? null : mood.id)}
                />
              ))}
            </ScrollView>
            {allTags.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                <FilterButton
                  label="Any tag"
                  selected={tagFilter === null}
                  onPress={() => setTagFilter(null)}
                />
                {allTags.map((tag) => (
                  <FilterButton
                    key={tag}
                    label={`#${tag}`}
                    selected={tagFilter === tag}
                    onPress={() => setTagFilter(tagFilter === tag ? null : tag)}
                  />
                ))}
              </ScrollView>
            )}
          </View>

          <View style={styles.calendarCard}>
            <View style={styles.monthHeader}>
              <Pressable
                onPress={() => changeMonth(-1)}
                style={styles.monthButton}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
              >
                <Ionicons name="chevron-back" size={22} color={notes.accent} />
              </Pressable>
              <Text style={styles.monthTitle}>{monthLabel(cursor.year, cursor.month)}</Text>
              <Pressable
                onPress={() => changeMonth(1)}
                style={styles.monthButton}
                accessibilityRole="button"
                accessibilityLabel="Next month"
              >
                <Ionicons name="chevron-forward" size={22} color={notes.accent} />
              </Pressable>
            </View>
            <View style={styles.calendarGrid}>
              {WEEKDAYS.map((day, index) => (
                <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>
              ))}
              {cells.map((dateKey) => {
                const date = fromDateKey(dateKey);
                const inMonth = date.getMonth() === cursor.month;
                const chosen = dateKey === selectedDate;
                const hasEntry = entriesByDate.has(dateKey);
                return (
                  <Pressable
                    key={dateKey}
                    onPress={() => void selectDate(dateKey)}
                    disabled={isLoading}
                    style={styles.dayCell}
                    accessibilityRole="button"
                    accessibilityLabel={`${dateLabel(dateKey)}${hasEntry ? ', journal entry' : ', no entry'}`}
                    accessibilityState={{ selected: chosen }}
                  >
                    <View
                      style={[
                        styles.day,
                        dateKey === today && styles.today,
                        chosen && styles.selectedDay,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNumber,
                          !inMonth && styles.outsideMonthNumber,
                          chosen && styles.selectedDayNumber,
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                      <View
                        style={[
                          styles.entryDot,
                          hasEntry && styles.entryDotActive,
                          chosen && hasEntry && styles.entryDotSelected,
                        ]}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.legend}>
              <View style={styles.entryDotActive} />
              <Text style={styles.legendText}>Journal entry</Text>
              {isLoading && <ActivityIndicator size="small" color={notes.accent} />}
            </View>
          </View>

          {shouldShowResults && (
            <View style={styles.resultsCard}>
              <Text style={styles.sectionTitle}>
                {showFavoritesOnly ? 'Favorites' : 'Search results'}
              </Text>
              {visibleEntries.length ? (
                visibleEntries.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => void selectDate(item.entry_date)}
                    style={styles.resultRow}
                    accessibilityRole="button"
                  >
                    <View style={styles.resultDate}>
                      <Text style={styles.resultDateDay}>
                        {fromDateKey(item.entry_date).getDate()}
                      </Text>
                      <Text style={styles.resultDateMonth}>
                        {fromDateKey(item.entry_date).toLocaleDateString(undefined, { month: 'short' })}
                      </Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.resultTitle} numberOfLines={1}>
                        {item.body.trim() || 'Photo memory'}
                      </Text>
                      <Text style={styles.resultMeta} numberOfLines={1}>
                        {[moodLabel(item.mood), item.tags.map((tag) => `#${tag}`).join(' ')]
                          .filter(Boolean)
                          .join(' · ') || 'Journal entry'}
                      </Text>
                    </View>
                    {item.photos.length > 0 && (
                      <Ionicons name="images-outline" size={18} color={notes.secondary} />
                    )}
                    {item.favorite === 1 && (
                      <Ionicons name="star" size={17} color={notes.accent} />
                    )}
                  </Pressable>
                ))
              ) : (
                <Text style={styles.emptyText}>No entries match those filters.</Text>
              )}
            </View>
          )}

          <View style={styles.entryCard}>
            <View style={styles.noteToolbar}>
              <View style={styles.toolbarLeft}>
                <Ionicons name="folder-outline" size={18} color={notes.accent} />
                <Text style={styles.toolbarText}>Journal</Text>
              </View>
              <Pressable
                onPress={() => updateDraft({ favorite: !draft.favorite })}
                disabled={!canEditEntry || (!selectedEntry && !hasJournalContent(draft))}
                style={styles.favoriteButton}
                accessibilityRole="button"
                accessibilityLabel={draft.favorite ? 'Remove from favorites' : 'Add to favorites'}
                accessibilityState={{ selected: draft.favorite }}
              >
                <Ionicons
                  name={draft.favorite ? 'star' : 'star-outline'}
                  size={22}
                  color={notes.accent}
                />
              </Pressable>
              {selectedEntry && (
                <Pressable
                  onPress={confirmDeleteEntry}
                  disabled={!canEditEntry}
                  style={styles.deleteButton}
                  accessibilityRole="button"
                  accessibilityLabel="Delete journal entry"
                >
                  <Ionicons name="trash-outline" size={20} color={notes.accent} />
                </Pressable>
              )}
              <Pressable
                onPress={() => Keyboard.dismiss()}
                style={styles.doneButton}
                accessibilityRole="button"
                accessibilityLabel="Done editing"
              >
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>

            <Text style={styles.entrySubheading}>
              {selectedEntry
                ? timestampLabel(selectedEntry.updated_at)
                : currentDate.toLocaleDateString(undefined, { dateStyle: 'long' })}
            </Text>
            <Text style={styles.entryDate}>{dateLabel(selectedDateKey)}</Text>
            <TextInput
              value={draft.body}
              onChangeText={(body) => updateDraft({ body })}
              editable={canEditEntry}
              placeholder="Start writing…"
              placeholderTextColor={notes.tertiary}
              selectionColor={notes.accent}
              cursorColor={notes.accent}
              style={styles.journalInput}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              maxLength={10000}
              accessibilityLabel="Journal entry"
            />
            <Text style={styles.saveStatus}>{saveStatus}</Text>

            <View style={styles.separator} />
            <Text style={styles.label}>How are you feeling?</Text>
            <View style={styles.moodGrid}>
              {JOURNAL_MOODS.map((mood) => (
                <Pressable
                  key={mood.id}
                  onPress={() => updateDraft({ mood: draft.mood === mood.id ? null : mood.id })}
                  disabled={!canEditEntry}
                  style={[styles.moodButton, draft.mood === mood.id && styles.moodButtonSelected]}
                  accessibilityRole="button"
                  accessibilityLabel={mood.label}
                  accessibilityState={{ selected: draft.mood === mood.id }}
                >
                  <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                  <Text style={[styles.moodLabel, draft.mood === mood.id && styles.moodLabelSelected]}>
                    {mood.label}
                  </Text>
                </Pressable>
              ))}
            </View>


            <View style={styles.sectionHeadingRow}>
              <Text style={styles.label}>Tags</Text>
              <Text style={styles.photoCount}>{draft.tags.length} tags</Text>
            </View>
            <View style={styles.tagAddRow}>
              <TextInput
                value={tagText}
                onChangeText={setTagText}
                onSubmitEditing={() => addTag(tagText)}
                editable={canEditEntry}
                placeholder="Add a tag"
                placeholderTextColor={notes.tertiary}
                style={styles.tagInput}
                returnKeyType="done"
                maxLength={24}
                accessibilityLabel="New journal tag"
              />
              <Pressable
                onPress={() => addTag(tagText)}
                disabled={!canEditEntry}
                style={styles.addButton}
                accessibilityRole="button"
                accessibilityLabel="Add tag"
              >
                <Ionicons name="add" size={22} color={notes.onAccent} />
              </Pressable>
            </View>
            <View style={styles.tagsWrap}>
              {SUGGESTED_TAGS.map((tag) => (
                <TagButton
                  key={tag}
                  label={tag}
                  selected={draft.tags.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase())}
                  disabled={!canEditEntry}
                  onPress={() => {
                    if (draft.tags.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase())) {
                      updateDraft({
                        tags: draft.tags.filter((item) => item.toLocaleLowerCase() !== tag.toLocaleLowerCase()),
                      });
                    } else {
                      addTag(tag);
                    }
                  }}
                />
              ))}
              {draft.tags
                .filter((tag) => !SUGGESTED_TAGS.some((suggested) => suggested.toLocaleLowerCase() === tag.toLocaleLowerCase()))
                .map((tag) => (
                  <TagButton
                    key={tag}
                    label={tag}
                    selected
                    disabled={!canEditEntry}
                    onPress={() => updateDraft({ tags: draft.tags.filter((item) => item !== tag) })}
                  />
                ))}
            </View>

            <View style={styles.sectionHeadingRow}>
              <Text style={styles.label}>Photos</Text>
              <Text style={styles.photoCount}>{draft.photos.length}/5</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
              {draft.photos.map((photo) => (
                <View key={photo} style={styles.photoFrame}>
                  <Image source={{ uri: journalPhotoUri(photo) }} style={styles.photo} />
                  <Pressable
                    onPress={() => updateDraft({ photos: draft.photos.filter((item) => item !== photo) })}
                    disabled={!canEditEntry}
                    style={styles.removePhoto}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                  >
                    <Ionicons name="close" size={16} color="#FFFFFF" />
                  </Pressable>
                </View>
              ))}
              {draft.photos.length < 5 && (
                <Pressable
                  onPress={choosePhotoSource}
                  disabled={!canEditEntry}
                  style={styles.addPhoto}
                  accessibilityRole="button"
                  accessibilityLabel="Add photos"
                >
                  <Ionicons name="camera-outline" size={24} color={notes.accent} />
                  <Text style={styles.addPhotoText}>Add photo</Text>
                </Pressable>
              )}
            </ScrollView>
            {!draft.body.trim() && draft.photos.length > 0 && (
              <Text style={styles.photoOnlyHint}>Photo-only memories are saved automatically.</Text>
            )}
            {selectedEntry && (
              <Text style={styles.updatedAt}>Created {timestampLabel(selectedEntry.created_at)}</Text>
            )}
          </View>

          <View style={styles.reminderCard}>
            <View style={styles.reminderTopRow}>
              <View style={styles.reminderIcon}>
                <Ionicons name="notifications" size={18} color={notes.onAccent} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.sectionTitle}>Daily reminder</Text>
                <Text style={styles.reminderHint}>Make a little time to check in with yourself.</Text>
              </View>
              <Switch
                value={reminderEnabled}
                onValueChange={(enabled) => void toggleReminder(enabled)}
                disabled={isSavingReminder}
                trackColor={{ false: notes.fill, true: notes.switchOn }}
                thumbColor="#FFFFFF"
                accessibilityLabel="Enable daily journal reminder"
              />
            </View>
            <View style={styles.reminderTimeRow}>
              <Text style={styles.reminderTimeLabel}>Reminder time</Text>
              <PickerField
                mode="time"
                value={timeAsDate(reminderTime)}
                onChange={(value) => void changeReminderTime(value)}
              />
            </View>
            {reminderMessage && (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">{reminderMessage}</Text>
            )}
          </View>

          {error && (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
              {!entryReady && (
                <Pressable
                  onPress={() => void loadEntryForDate(selectedDateRef.current)}
                  accessibilityRole="button"
                >
                  <Text style={styles.retryText}>Retry loading this date</Text>
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FilterButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterButton, selected && styles.filterButtonSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.filterButtonText, selected && styles.filterButtonTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function TagButton({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.tagChip, selected && styles.tagChipSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.tagText, selected && styles.tagTextSelected]}>#{label}</Text>
    </Pressable>
  );
}

const styles = createThemedStyleSheet((colors) => {
  const notes = notesPalette(colors === darkColors);
  const group = { backgroundColor: notes.sheet, borderRadius: 12 } as const;
  return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: notes.background },
  flex: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: spacing.md,
    paddingBottom: 64,
    gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: notes.secondary, fontSize: 13 },
  title: { color: notes.label, fontSize: 34, fontWeight: '700', letterSpacing: 0.4, marginTop: 2 },
  filtersCard: { gap: spacing.sm },
  searchBox: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: notes.fill,
  },
  searchInput: { flex: 1, color: notes.label, fontSize: 17, paddingVertical: 7 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  filterScroll: { gap: spacing.xs, paddingVertical: 2 },
  filterButton: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: notes.fill,
  },
  filterButtonSelected: { backgroundColor: notes.accentSoft },
  filterButtonText: { color: notes.label, fontSize: 13, fontWeight: '500' },
  filterButtonTextSelected: { color: notes.accent, fontWeight: '600' },
  calendarCard: { ...group, padding: spacing.md },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  monthButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { color: notes.label, fontSize: 17, fontWeight: '600' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', height: 28, textAlign: 'center', textAlignVertical: 'center', color: notes.tertiary, fontSize: 12, fontWeight: '600' },
  dayCell: { width: '14.2857%', padding: 2, alignItems: 'center' },
  day: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21 },
  today: {},
  selectedDay: { backgroundColor: notes.accent },
  dayNumber: { color: notes.label, fontSize: 16 },
  outsideMonthNumber: { color: notes.tertiary },
  selectedDayNumber: { color: notes.onAccent, fontWeight: '600' },
  entryDot: { width: 5, height: 5, marginTop: 2, borderRadius: 3, backgroundColor: 'transparent' },
  entryDotActive: { width: 5, height: 5, borderRadius: 3, backgroundColor: notes.accent },
  entryDotSelected: { backgroundColor: notes.onAccent },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, minHeight: 20 },
  legendText: { flex: 1, color: notes.secondary, fontSize: 12 },
  resultsCard: { ...group, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  sectionTitle: { color: notes.label, fontSize: 17, fontWeight: '600' },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: notes.separator,
  },
  resultDate: { width: 38, alignItems: 'center' },
  resultDateDay: { color: notes.label, fontSize: 17, fontWeight: '600' },
  resultDateMonth: { color: notes.secondary, fontSize: 11 },
  resultTitle: { color: notes.label, fontSize: 16, fontWeight: '600' },
  resultMeta: { color: notes.secondary, fontSize: 14, marginTop: 2 },
  emptyText: { color: notes.secondary, fontSize: 15, paddingVertical: spacing.sm },
  entryCard: { ...group, gap: spacing.md, paddingHorizontal: 18, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  noteToolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  toolbarLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolbarText: { color: notes.accent, fontSize: 17 },
  doneButton: { minHeight: 40, justifyContent: 'center', paddingLeft: spacing.xs },
  doneText: { color: notes.accent, fontSize: 17, fontWeight: '600' },
  entrySubheading: { color: notes.secondary, fontSize: 13, textAlign: 'center' },
  entryDate: { color: notes.label, fontSize: 28, fontWeight: '700', marginBottom: -spacing.sm },
  favoriteButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  deleteButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  label: { color: notes.secondary, fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.xs },
  moodButton: {
    flex: 1,
    minWidth: 54,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    backgroundColor: notes.fill,
  },
  moodButtonSelected: { backgroundColor: notes.accentSoft },
  moodEmoji: { fontSize: 24 },
  moodLabel: { color: notes.secondary, fontSize: 11, fontWeight: '500' },
  moodLabelSelected: { color: notes.accent, fontWeight: '700' },
  journalInput: {
    minHeight: 220,
    padding: 0,
    color: notes.label,
    fontSize: 17,
    lineHeight: 24,
  },
  saveStatus: { alignSelf: 'flex-end', color: notes.tertiary, fontSize: 12, marginTop: -spacing.sm },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: notes.separator },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  photoCount: { color: notes.secondary, fontSize: 13 },
  tagAddRow: { flexDirection: 'row', gap: spacing.sm },
  tagInput: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: notes.fill,
    color: notes.label,
    fontSize: 16,
  },
  addButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: notes.accent },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tagChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: notes.fill },
  tagChipSelected: { backgroundColor: notes.accentSoft },
  tagText: { color: notes.secondary, fontSize: 14, fontWeight: '500' },
  tagTextSelected: { color: notes.accent, fontWeight: '600' },
  photoRow: { gap: spacing.sm, paddingVertical: 2 },
  photoFrame: { width: 96, height: 96, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  photo: { width: '100%', height: '100%' },
  removePhoto: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.65)' },
  addPhoto: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 10, backgroundColor: notes.fill },
  addPhotoText: { color: notes.accent, fontSize: 12, fontWeight: '600' },
  photoOnlyHint: { color: notes.secondary, fontSize: 12 },
  updatedAt: { color: notes.tertiary, fontSize: 12, textAlign: 'center' },
  reminderCard: { ...group, gap: spacing.md, padding: spacing.md },
  reminderTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  reminderIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: notes.accent },
  reminderHint: { color: notes.secondary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  reminderTimeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: notes.separator, paddingTop: spacing.sm },
  reminderTimeLabel: { color: notes.label, fontSize: 17 },
  errorText: { color: notes.danger, fontSize: 13, lineHeight: 18 },
  retryText: { color: notes.accent, fontSize: 15, fontWeight: '600', marginTop: spacing.sm },
  errorCard: { ...group, padding: spacing.md },
  });
});

import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export const JOURNAL_MOODS = [
  { id: 'great', emoji: '😊', label: 'Great' },
  { id: 'good', emoji: '🙂', label: 'Good' },
  { id: 'okay', emoji: '😐', label: 'Okay' },
  { id: 'sad', emoji: '😔', label: 'Sad' },
  { id: 'angry', emoji: '😡', label: 'Angry' },
] as const;

export type JournalMood = (typeof JOURNAL_MOODS)[number]['id'];

export type JournalEntry = {
  id: string;
  entry_date: string;
  body: string;
  mood: JournalMood | null;
  tags: string[];
  photos: string[];
  favorite: number;
  created_at: number;
  updated_at: number;
};

type JournalEntryRow = Omit<JournalEntry, 'tags' | 'photos'> & {
  tags: string;
  photos: string;
};

export type JournalDraft = {
  body: string;
  mood: JournalMood | null;
  tags: string[];
  photos: string[];
  favorite: boolean;
};

export type JournalFilters = {
  query?: string;
  mood?: JournalMood | null;
  tag?: string | null;
  date?: string | null;
  favoritesOnly?: boolean;
};

export type JournalPreferences = {
  reminder_enabled: number;
  reminder_time: string;
};

function parseJsonArray(value: string, fieldName: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      throw new Error(`${fieldName} must be a list of strings.`);
    }
    const items = parsed.filter((item): item is string => typeof item === 'string');
    if (items.length !== parsed.length) {
      throw new Error(`${fieldName} must be a list of strings.`);
    }
    return items;
  } catch (error: unknown) {
    throw new Error(`Could not read saved journal ${fieldName}.`, { cause: error });
  }
}

function mapEntry(row: JournalEntryRow): JournalEntry {
  return { ...row, tags: parseJsonArray(row.tags, 'tags'), photos: parseJsonArray(row.photos, 'photos') };
}

export function draftFromEntry(entry: JournalEntry | null): JournalDraft {
  return {
    body: entry?.body ?? '',
    mood: entry?.mood ?? null,
    tags: entry?.tags ?? [],
    photos: entry?.photos ?? [],
    favorite: entry?.favorite === 1,
  };
}

export function hasJournalContent(draft: JournalDraft) {
  return Boolean(draft.body.trim() || draft.mood || draft.tags.length || draft.photos.length);
}

export async function listJournalEntries(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<JournalEntryRow>(
    `SELECT id, entry_date, body, mood, tags, photos, favorite, created_at, updated_at
     FROM journal_entries ORDER BY entry_date DESC`,
  );
  return rows.map(mapEntry);
}

export async function getJournalEntry(db: SQLiteDatabase, date: string) {
  const row = await db.getFirstAsync<JournalEntryRow>(
    `SELECT id, entry_date, body, mood, tags, photos, favorite, created_at, updated_at
     FROM journal_entries WHERE entry_date = ?`,
    date,
  );
  return row ? mapEntry(row) : null;
}

export async function saveJournalEntry(
  db: SQLiteDatabase,
  date: string,
  draft: JournalDraft,
  now = Date.now(),
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Journal date must use YYYY-MM-DD format.');
  }
  const [year, month, day] = date.split('-').map(Number);
  const parsedDate = new Date(year, month - 1, day);
  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    throw new Error('Journal date is not a valid calendar date.');
  }
  if (draft.mood && !JOURNAL_MOODS.some((mood) => mood.id === draft.mood)) {
    throw new Error('Journal mood is not supported.');
  }
  if (draft.photos.length > 5) throw new Error('A journal entry can contain up to five photos.');
  const tags: string[] = [];
  for (const rawTag of draft.tags) {
    const tag = rawTag.trim();
    if (
      tag &&
      !tags.some((existingTag) => existingTag.toLocaleLowerCase() === tag.toLocaleLowerCase())
    ) {
      tags.push(tag);
    }
  }
  const existing = await getJournalEntry(db, date);
  const id = existing?.id ?? randomUUID();
  await db.runAsync(
    `INSERT INTO journal_entries
      (id, entry_date, body, mood, tags, photos, favorite, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(entry_date) DO UPDATE SET
       body = excluded.body,
       mood = excluded.mood,
       tags = excluded.tags,
       photos = excluded.photos,
       favorite = excluded.favorite,
       updated_at = excluded.updated_at`,
    id,
    date,
    draft.body,
    draft.mood,
    JSON.stringify(tags),
    JSON.stringify(draft.photos),
    draft.favorite ? 1 : 0,
    existing?.created_at ?? now,
    now,
  );
  return getJournalEntry(db, date);
}

export async function deleteJournalEntry(db: SQLiteDatabase, date: string) {
  await db.runAsync('DELETE FROM journal_entries WHERE entry_date = ?', date);
}

export async function loadJournalPreferences(db: SQLiteDatabase) {
  const preferences = await db.getFirstAsync<JournalPreferences>(
    'SELECT reminder_enabled, reminder_time FROM journal_preferences WHERE id = 1',
  );
  if (!preferences) throw new Error('Journal reminder preferences are missing.');
  return preferences;
}

export async function saveJournalPreferences(
  db: SQLiteDatabase,
  enabled: boolean,
  time: string,
) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error('Reminder time must use HH:MM format.');
  }
  await db.runAsync(
    `INSERT INTO journal_preferences (id, reminder_enabled, reminder_time)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       reminder_enabled = excluded.reminder_enabled,
       reminder_time = excluded.reminder_time`,
    enabled ? 1 : 0,
    time,
  );
}

export function filterJournalEntries(entries: JournalEntry[], filters: JournalFilters) {
  const query = filters.query?.trim().toLocaleLowerCase() ?? '';
  return entries.filter((entry) => {
    if (filters.favoritesOnly && entry.favorite !== 1) return false;
    if (filters.date && entry.entry_date !== filters.date) return false;
    if (filters.mood && entry.mood !== filters.mood) return false;
    if (
      filters.tag &&
      !entry.tags.some((tag) => tag.toLocaleLowerCase() === filters.tag?.toLocaleLowerCase())
    ) {
      return false;
    }
    if (query) {
      const searchable = `${entry.body}\n${entry.tags.join(' ')}`.toLocaleLowerCase();
      if (!searchable.includes(query)) return false;
    }
    return true;
  });
}

export function getJournalStreak(entries: JournalEntry[], today: string) {
  const dates = new Set(entries.map((entry) => entry.entry_date));
  let current = dates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (dates.has(current)) {
    streak += 1;
    current = addDays(current, -1);
  }
  return streak;
}

function addDays(date: string, amount: number) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(year, month - 1, day + amount);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

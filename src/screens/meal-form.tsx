import { createThemedStyleSheet } from '../providers/theme-provider';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, ChipRow, FieldLabel, formStyles } from '../components/form';
import { PickerField } from '../components/picker-field';
import { RoundButton } from '../components/round-button';
import { goBack } from '../components/screen-header';
import { MEAL_TYPES } from '../constants/meals';
import { lightColors as colors, MAX_CONTENT_WIDTH, radius, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import { deleteMeal, getMeal, saveMeal, type MealType } from '../database/consumption';
import { fromDateKey } from '../lib/dates';
import { deleteMealPhoto, mealPhotoUri, saveMealPhoto } from '../lib/meal-photos';

type Photo = { kind: 'none' } | { kind: 'saved'; name: string } | { kind: 'picked'; uri: string };

function defaultMealType(hour: number): MealType {
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 18) return 'snack';
  return 'dinner';
}

function initialEatenAt(dateKey?: string) {
  const now = new Date();
  if (!dateKey) return now;
  const date = fromDateKey(dateKey);
  date.setHours(now.getHours(), now.getMinutes(), 0, 0);
  return date;
}

type Props = { session: Session; mealId?: string; dateKey?: string };

export function MealForm({ session, mealId, dateKey }: Props) {
  const isEditing = Boolean(mealId);
  const [name, setName] = useState('');
  const [mealType, setMealType] = useState<MealType>(() => defaultMealType(new Date().getHours()));
  const [eatenAt, setEatenAt] = useState(() => initialEatenAt(dateKey));
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<Photo>({ kind: 'none' });
  const [originalPhoto, setOriginalPhoto] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mealId) return;
    let active = true;
    (async () => {
      try {
        const db = await getDatabase(session.user.id);
        const meal = await getMeal(db, mealId);
        if (!active) return;
        if (!meal) {
          goBack();
          return;
        }
        setName(meal.name);
        setMealType(meal.meal_type);
        setEatenAt(new Date(meal.eaten_at));
        setNotes(meal.notes ?? '');
        setOriginalPhoto(meal.photo);
        setPhoto(meal.photo ? { kind: 'saved', name: meal.photo } : { kind: 'none' });
      } catch (e: unknown) {
        if (active) setError(e instanceof Error ? e.message : 'Could not load this meal.');
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [session.user.id, mealId]);

  const trimmedName = name.trim();
  const canSave = !isLoading && trimmedName.length > 0;
  const previewUri =
    photo.kind === 'picked' ? photo.uri : photo.kind === 'saved' ? mealPhotoUri(photo.name) : null;

  async function pick(source: 'camera' | 'library') {
    try {
      setError(null);
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(`Allow ${source === 'camera' ? 'camera' : 'photo'} access in Settings to add a photo.`);
        return;
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled) setPhoto({ kind: 'picked', uri: result.assets[0].uri });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not open the photo picker.');
    }
  }

  function choosePhoto() {
    Alert.alert(
      'Meal photo',
      undefined,
      [
        { text: 'Take Photo', onPress: () => pick('camera') },
        { text: 'Choose from Library', onPress: () => pick('library') },
        photo.kind === 'none'
          ? { text: 'Cancel', style: 'cancel' }
          : { text: 'Remove Photo', style: 'destructive', onPress: () => setPhoto({ kind: 'none' }) },
      ],
      { cancelable: true },
    );
  }

  async function handleSave() {
    if (!canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      let photoName: string | null = photo.kind === 'saved' ? photo.name : null;
      if (photo.kind === 'picked') photoName = await saveMealPhoto(photo.uri);
      const db = await getDatabase(session.user.id);
      await saveMeal(db, {
        id: mealId,
        mealType,
        name: trimmedName,
        notes: notes.trim(),
        photo: photoName,
        eatenAt: eatenAt.getTime(),
      });
      if (originalPhoto && originalPhoto !== photoName) deleteMealPhoto(originalPhoto);
      goBack();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save this meal.');
      setIsSaving(false);
    }
  }

  function confirmDelete() {
    if (!mealId) return;
    Alert.alert('Delete this meal?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const db = await getDatabase(session.user.id);
            await deleteMeal(db, mealId);
            if (originalPhoto) deleteMealPhoto(originalPhoto);
            goBack();
          } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Could not delete this meal.');
          }
        },
      },
    ]);
  }

  function withDate(date: Date) {
    setEatenAt(
      (current) =>
        new Date(date.getFullYear(), date.getMonth(), date.getDate(), current.getHours(), current.getMinutes()),
    );
  }

  function withTime(time: Date) {
    setEatenAt(
      (current) =>
        new Date(current.getFullYear(), current.getMonth(), current.getDate(), time.getHours(), time.getMinutes()),
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={formStyles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <RoundButton icon="arrow-back" label="Go back" onPress={goBack} />
            <Text style={styles.title}>{isEditing ? 'Edit Meal' : 'Log Meal'}</Text>
            {isEditing ? (
              <RoundButton icon="trash-outline" label="Delete meal" onPress={confirmDelete} color={colors.danger} />
            ) : (
              <View style={styles.topSpacer} />
            )}
          </View>

          <Pressable
            onPress={choosePhoto}
            style={({ pressed }) => [styles.photoBox, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Add meal photo"
          >
            {previewUri ? (
              <Image source={{ uri: previewUri }} style={styles.photo} />
            ) : (
              <>
                <View style={styles.cameraCircle}>
                  <Ionicons name="camera-outline" size={22} color="#3B82F6" />
                </View>
                <Text style={styles.photoTitle}>Take Photo or Choose Gallery</Text>
                <Text style={styles.photoHint}>Supports JPG and PNG</Text>
              </>
            )}
          </Pressable>

          <FieldLabel>MEAL NAME</FieldLabel>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Grilled Chicken Pesto Wrap"
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="words"
            maxLength={80}
            style={formStyles.input}
            accessibilityLabel="Meal name"
          />

          <FieldLabel>MEAL TYPE</FieldLabel>
          <ChipRow>
            {MEAL_TYPES.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                selected={mealType === option.id}
                onPress={() => setMealType(option.id)}
              />
            ))}
          </ChipRow>

          <View style={styles.row}>
            <View style={styles.flex}>
              <FieldLabel>DATE</FieldLabel>
              <View style={styles.pickerBox}>
                <PickerField mode="date" value={eatenAt} onChange={withDate} />
              </View>
            </View>
            <View style={styles.flex}>
              <FieldLabel>TIME</FieldLabel>
              <View style={styles.pickerBox}>
                <PickerField mode="time" value={eatenAt} onChange={withTime} />
              </View>
            </View>
          </View>

          <FieldLabel>NOTES & INGREDIENTS (OPTIONAL)</FieldLabel>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Add any specific nutritional notes, calorie count, or ingredient breakdowns…"
            placeholderTextColor={colors.textSubtle}
            maxLength={300}
            multiline
            style={[formStyles.input, styles.multiline]}
            accessibilityLabel="Notes and ingredients"
          />

          {error && <Text style={formStyles.error}>{error}</Text>}

          <Pressable
            onPress={handleSave}
            disabled={!canSave || isSaving}
            style={({ pressed }) => [
              styles.save,
              (!canSave || isSaving) && styles.disabled,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.saveText}>{isSaving ? 'Saving…' : 'Save Meal Entry'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  topSpacer: { width: 44 },
  photoBox: {
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: MAX_CONTENT_WIDTH,
  },
  photo: { width: '100%', height: '100%' },
  cameraCircle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
  },
  photoTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  photoHint: { color: colors.textSubtle, fontSize: 11 },
  row: { flexDirection: 'row', gap: spacing.md },
  pickerBox: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    marginTop: spacing.sm,
  },
  multiline: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
  save: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  saveText: { color: colors.heroBackground, fontSize: 15, fontWeight: '800' },
}));

import type { Session } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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

import { CurrencyPicker } from '../components/currency-picker';
import { DEFAULT_CURRENCY, isCurrencyCode } from '../constants/currencies';
import { DEFAULT_HOME_PAGE_ORDER, HOME_PAGES, moveHomePage, type HomePageId } from '../constants/home-pages';
import { lightColors as colors, MAX_CONTENT_WIDTH, radius, spacing } from '../constants/theme';
import { loadHomePageOrder, saveHomePageOrder } from '../lib/home-page-preference';
import { supabase } from '../lib/supabase';

type ProfileProps = {
  session: Session;
};

function savedName(session: Session) {
  const name = session.user.user_metadata?.display_name;
  return typeof name === 'string' ? name.trim() : '';
}

const AVATAR_BUCKET = 'avatars';
const GENDERS = ['Female', 'Male', 'Non-binary', 'Prefer not to say'] as const;

type Form = {
  name: string;
  email: string;
  dob: string;
  gender: string;
  weight: string;
  height: string;
  address: string;
  currency: string;
};

function metaString(session: Session, key: string) {
  const value = session.user.user_metadata?.[key];
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' ? value.trim() : '';
}

function loadForm(session: Session): Form {
  return {
    name: savedName(session),
    email: session.user.email ?? '',
    dob: metaString(session, 'date_of_birth'),
    gender: metaString(session, 'gender'),
    weight: metaString(session, 'weight_kg'),
    height: metaString(session, 'height_cm'),
    address: metaString(session, 'address'),
    currency: currencyFromMeta(metaString(session, 'currency')),
  };
}

function currencyFromMeta(value: string) {
  return isCurrencyCode(value) ? value : DEFAULT_CURRENCY;
}

function parseDob(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function ageFromDob(value: string) {
  const dob = parseDob(value);
  if (!dob) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  if (
    today.getMonth() < dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())
  ) {
    age -= 1;
  }
  return age;
}

function numberInRange(value: string, min: number, max: number) {
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function validate(form: Form) {
  const errors: Partial<Record<keyof Form, string>> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (form.dob) {
    const age = ageFromDob(form.dob);
    if (age === null) errors.dob = 'Use the format YYYY-MM-DD.';
    else if (age < 0 || age > 120) errors.dob = 'Enter a valid date of birth.';
  }
  if (form.weight && numberInRange(form.weight, 1, 700) === null) {
    errors.weight = 'Enter a weight between 1 and 700 kg.';
  }
  if (form.height && numberInRange(form.height, 30, 272) === null) {
    errors.height = 'Enter a height between 30 and 272 cm.';
  }
  return errors;
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function avatarUrl(session: Session) {
  const url = session.user.user_metadata?.avatar_url;
  return typeof url === 'string' && url ? url : null;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Please try again.';
}

export function Profile({ session }: ProfileProps) {
  const email = session.user.email ?? '';
  const saved = loadForm(session);
  const currentName = saved.name;
  const [form, setForm] = useState<Form>(saved);
  const [pendingEmail, setPendingEmail] = useState<string | null>(
    session.user.new_email ?? null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [homePageOrder, setHomePageOrder] = useState<HomePageId[]>([...DEFAULT_HOME_PAGE_ORDER]);
  const [isLoadingHomePageOrder, setIsLoadingHomePageOrder] = useState(true);
  const [isSavingHomePageOrder, setIsSavingHomePageOrder] = useState(false);
  const [homePageOrderError, setHomePageOrderError] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(avatarUrl(session));
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    loadHomePageOrder(session.user.id)
      .then((order) => {
        if (mounted) {
          setHomePageOrder(order);
          setHomePageOrderError(null);
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setHomePageOrderError(
            error instanceof Error ? error.message : 'Could not load the home page order.',
          );
        }
      })
      .finally(() => {
        if (mounted) setIsLoadingHomePageOrder(false);
      });
    return () => {
      mounted = false;
    };
  }, [session.user.id]);

  const trimmed: Form = {
    name: form.name.trim(),
    email: form.email.trim(),
    dob: form.dob.trim(),
    gender: form.gender,
    weight: form.weight.trim().replace(',', '.'),
    height: form.height.trim().replace(',', '.'),
    address: form.address.trim(),
    currency: form.currency,
  };
  const errors = validate(trimmed);
  const baseline: Form = { ...saved, email: pendingEmail ?? saved.email };
  const isDirty = (Object.keys(trimmed) as (keyof Form)[]).some((k) => trimmed[k] !== baseline[k]);
  const age = ageFromDob(trimmed.dob);
  const displayName = currentName || email.split('@')[0] || 'You';
  const canSave =
    !isSaving && trimmed.name.length > 0 && isDirty && Object.keys(errors).length === 0;

  function update(key: keyof Form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/dashboard');
  }

  async function reorderHomePage(pageId: HomePageId, targetIndex: number) {
    if (isSavingHomePageOrder || isLoadingHomePageOrder) return;
    const next = moveHomePage(homePageOrder, pageId, targetIndex);
    if (next === homePageOrder) return;
    setIsSavingHomePageOrder(true);
    setHomePageOrderError(null);
    try {
      setHomePageOrder(await saveHomePageOrder(session.user.id, next));
    } catch (error: unknown) {
      setHomePageOrderError(
        error instanceof Error ? error.message : 'Could not save your home page order.',
      );
    } finally {
      setIsSavingHomePageOrder(false);
    }
  }

  async function resetHomePageOrder() {
    if (isSavingHomePageOrder || isLoadingHomePageOrder) return;
    setIsSavingHomePageOrder(true);
    setHomePageOrderError(null);
    try {
      setHomePageOrder(await saveHomePageOrder(session.user.id, DEFAULT_HOME_PAGE_ORDER));
    } catch (error: unknown) {
      setHomePageOrderError(
        error instanceof Error ? error.message : 'Could not reset your home page order.',
      );
    } finally {
      setIsSavingHomePageOrder(false);
    }
  }

  async function handleSave() {
    if (!supabase || !canSave) return;
    setIsSaving(true);
    setMessage(null);
    try {
      const emailChanged = trimmed.email.toLowerCase() !== email.toLowerCase();
      const { error } = await supabase.auth.updateUser({
        ...(emailChanged ? { email: trimmed.email } : {}),
        data: {
          display_name: trimmed.name,
          date_of_birth: trimmed.dob,
          gender: trimmed.gender,
          weight_kg: trimmed.weight ? Number(trimmed.weight) : '',
          height_cm: trimmed.height ? Number(trimmed.height) : '',
          address: trimmed.address,
          currency: trimmed.currency,
        },
      });
      if (error) throw error;
      if (emailChanged) {
        setPendingEmail(trimmed.email);
        setMessage({
          kind: 'success',
          text: `Profile updated. Check ${trimmed.email} for a confirmation link to finish changing your email.`,
        });
      } else {
        setMessage({ kind: 'success', text: 'Profile updated.' });
      }
    } catch (error: unknown) {
      setMessage({ kind: 'error', text: `Could not save: ${errorText(error)}` });
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePickPhoto() {
    if (!supabase || isUploading) return;
    setMessage(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled) return;

      setIsUploading(true);
      const asset = result.assets[0];
      const path = `${session.user.id}/avatar.jpg`;
      const body = await (await fetch(asset.uri)).arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, body, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      const { error } = await supabase.auth.updateUser({ data: { avatar_url: url } });
      if (error) throw error;
      setPhotoUri(url);
      setMessage({ kind: 'success', text: 'Profile photo updated.' });
    } catch (error: unknown) {
      setMessage({ kind: 'error', text: `Could not upload photo: ${errorText(error)}` });
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSignOut() {
    if (!supabase) return;
    setIsSigningOut(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error: unknown) {
      setMessage({ kind: 'error', text: `Could not sign out: ${errorText(error)}` });
      setIsSigningOut(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <Pressable
              onPress={goBack}
              hitSlop={8}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Text style={styles.backText}>‹ Back</Text>
            </Pressable>
            <Text style={styles.title}>Profile</Text>
            <View style={styles.topBarSpacer} />
          </View>

          <View style={styles.identity}>
            <Pressable
              onPress={handlePickPhoto}
              disabled={isUploading}
              style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
              )}
              {isUploading && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color={colors.onPrimary} />
                </View>
              )}
            </Pressable>
            <Pressable onPress={handlePickPhoto} disabled={isUploading} hitSlop={8}>
              <Text style={styles.changePhoto}>{photoUri ? 'Change photo' : 'Add photo'}</Text>
            </Pressable>
            <Text style={styles.name}>{displayName}</Text>
            {email ? <Text style={styles.email}>{email}</Text> : null}
          </View>

          <View style={styles.card}>
            <View style={styles.homePagesHeading}>
              <View style={styles.flex}>
                <Text style={styles.sectionTitle}>Home page sequence</Text>
                <Text style={styles.hint}>
                  Choose the order of pages when you swipe through Home.
                </Text>
              </View>
              <Pressable
                onPress={resetHomePageOrder}
                disabled={isSavingHomePageOrder || isLoadingHomePageOrder}
                style={({ pressed }) => [
                  styles.resetOrderButton,
                  (isSavingHomePageOrder || isLoadingHomePageOrder) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Reset home page order"
              >
                <Text style={styles.resetOrderText}>Reset</Text>
              </Pressable>
            </View>
            {homePageOrder.map((pageId, index) => {
              const page = HOME_PAGES.find((item) => item.id === pageId);
              if (!page) return null;
              const disabled = isLoadingHomePageOrder || isSavingHomePageOrder;
              return (
                <View key={page.id} style={styles.homePageRow}>
                  <View style={styles.homePagePosition}>
                    <Text style={styles.homePagePositionText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.homePageName}>{page.label}</Text>
                  <View style={styles.reorderActions}>
                    <Pressable
                      onPress={() => reorderHomePage(page.id, 0)}
                      disabled={disabled || index <= 0}
                      style={({ pressed }) => [
                        styles.reorderButton,
                        (disabled || index <= 0) && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${page.label} to first`}
                    >
                      <Ionicons name="play-skip-back" size={16} color={colors.primary} />
                    </Pressable>
                    <Pressable
                      onPress={() => reorderHomePage(page.id, index - 1)}
                      disabled={disabled || index <= 0}
                      style={({ pressed }) => [
                        styles.reorderButton,
                        (disabled || index <= 0) && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${page.label} earlier`}
                    >
                      <Ionicons name="chevron-up" size={20} color={colors.primary} />
                    </Pressable>
                    <Pressable
                      onPress={() => reorderHomePage(page.id, index + 1)}
                      disabled={disabled || index < 0 || index >= HOME_PAGES.length - 1}
                      style={({ pressed }) => [
                        styles.reorderButton,
                        (disabled || index < 0 || index >= HOME_PAGES.length - 1) && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${page.label} later`}
                    >
                      <Ionicons name="chevron-down" size={20} color={colors.primary} />
                    </Pressable>
                    <Pressable
                      onPress={() => reorderHomePage(page.id, HOME_PAGES.length - 1)}
                      disabled={disabled || index < 0 || index >= HOME_PAGES.length - 1}
                      style={({ pressed }) => [
                        styles.reorderButton,
                        (disabled || index < 0 || index >= HOME_PAGES.length - 1) && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${page.label} to last`}
                    >
                      <Ionicons name="play-skip-forward" size={16} color={colors.primary} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
            {isLoadingHomePageOrder && (
              <Text style={styles.hint} accessibilityLiveRegion="polite">Loading home page order…</Text>
            )}
            {isSavingHomePageOrder && (
              <Text style={styles.hint} accessibilityLiveRegion="polite">Saving sequence…</Text>
            )}
            {homePageOrderError && (
              <Text style={[styles.message, styles.error]} accessibilityLiveRegion="polite">
                {homePageOrderError}
              </Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>DISPLAY NAME</Text>
            <TextInput
              value={form.name}
              onChangeText={(text) => update('name', text)}
              placeholder="Your name"
              placeholderTextColor={colors.textSubtle}
              autoCapitalize="words"
              autoComplete="name"
              maxLength={60}
              returnKeyType="next"
              style={styles.input}
              accessibilityLabel="Display name"
            />

            <Text style={[styles.label, styles.fieldGap]}>EMAIL</Text>
            <TextInput
              value={form.email}
              onChangeText={(text) => update('email', text)}
              placeholder="you@example.com"
              placeholderTextColor={colors.textSubtle}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              style={styles.input}
              accessibilityLabel="Email"
            />
            {errors.email ? (
              <Text style={[styles.message, styles.error]}>{errors.email}</Text>
            ) : null}

            <Text style={[styles.label, styles.fieldGap]}>DATE OF BIRTH</Text>
            <TextInput
              value={form.dob}
              onChangeText={(text) => update('dob', text)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSubtle}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              autoCorrect={false}
              style={styles.input}
              accessibilityLabel="Date of birth"
            />
            {errors.dob ? <Text style={[styles.message, styles.error]}>{errors.dob}</Text> : null}

            <Text style={[styles.label, styles.fieldGap]}>AGE</Text>
            <View style={[styles.input, styles.readOnly]}>
              <Text style={styles.readOnlyText}>
                {age !== null && age >= 0 && age <= 120 ? `${age} years` : '—'}
              </Text>
            </View>

            <Text style={[styles.label, styles.fieldGap]}>GENDER</Text>
            <View style={styles.chips}>
              {GENDERS.map((option) => {
                const selected = form.gender === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => update('gender', selected ? '' : option)}
                    style={({ pressed }) => [
                      styles.chip,
                      selected && styles.chipSelected,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.row, styles.fieldGap]}>
              <View style={styles.flex}>
                <Text style={styles.label}>WEIGHT (KG)</Text>
                <TextInput
                  value={form.weight}
                  onChangeText={(text) => update('weight', text)}
                  placeholder="e.g. 60"
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="decimal-pad"
                  maxLength={6}
                  style={styles.input}
                  accessibilityLabel="Weight in kilograms"
                />
              </View>
              <View style={styles.flex}>
                <Text style={styles.label}>HEIGHT (CM)</Text>
                <TextInput
                  value={form.height}
                  onChangeText={(text) => update('height', text)}
                  placeholder="e.g. 165"
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="decimal-pad"
                  maxLength={6}
                  style={styles.input}
                  accessibilityLabel="Height in centimeters"
                />
              </View>
            </View>
            {errors.weight ? (
              <Text style={[styles.message, styles.error]}>{errors.weight}</Text>
            ) : null}
            {errors.height ? (
              <Text style={[styles.message, styles.error]}>{errors.height}</Text>
            ) : null}

            <Text style={[styles.label, styles.fieldGap]}>ADDRESS</Text>
            <TextInput
              value={form.address}
              onChangeText={(text) => update('address', text)}
              placeholder="Street, city, country"
              placeholderTextColor={colors.textSubtle}
              autoCapitalize="words"
              autoComplete="street-address"
              maxLength={200}
              multiline
              style={[styles.input, styles.multiline]}
              accessibilityLabel="Address"
            />

            <Text style={[styles.label, styles.fieldGap]}>CURRENCY</Text>
            <CurrencyPicker value={form.currency} onChange={(code) => update('currency', code)} />
            <Text style={styles.hint}>
              Used to display your wallet balances. Existing amounts are not converted.
            </Text>
            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.primaryButton,
                !canSave && styles.disabled,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
            >
              {isSaving ? (
                <ActivityIndicator color={colors.onPrimary} size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Save changes</Text>
              )}
            </Pressable>
            {message && (
              <Text
                style={[styles.message, message.kind === 'error' ? styles.error : styles.success]}
                accessibilityLiveRegion="polite"
              >
                {message.text}
              </Text>
            )}
          </View>

          <View style={styles.card}>
            <View style={[styles.infoRow, styles.infoBorder]}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue} numberOfLines={1}>
                {email || '—'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Member since</Text>
              <Text style={styles.infoValue}>{formatDate(session.user.created_at)}</Text>
            </View>
          </View>

          <Pressable
            onPress={handleSignOut}
            disabled={isSigningOut}
            style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            {isSigningOut ? (
              <ActivityIndicator color={colors.danger} size="small" />
            ) : (
              <Text style={styles.signOutText}>Sign out</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  backButton: { minWidth: 64, minHeight: 40, justifyContent: 'center' },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  topBarSpacer: { minWidth: 64 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  identity: { alignItems: 'center', paddingVertical: spacing.lg },
  avatar: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  changePhoto: { color: colors.primary, fontSize: 14, fontWeight: '600', marginBottom: spacing.md },
  avatarText: { color: colors.primary, fontSize: 36, fontWeight: '700' },
  name: { color: colors.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.6 },
  email: { color: colors.textMuted, fontSize: 14, marginTop: spacing.xs },
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  homePagesHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  homePageRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  homePagePosition: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
  },
  homePagePositionText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  homePageName: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' },
  reorderActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  reorderButton: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  resetOrderButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  resetOrderText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  label: {
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    fontSize: 16,
  },
  hint: { color: colors.textSubtle, fontSize: 12, marginTop: spacing.sm },
  fieldGap: { marginTop: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md },
  readOnly: { justifyContent: 'center', opacity: 0.8 },
  readOnlyText: { color: colors.text, fontSize: 16 },
  multiline: { minHeight: 72, paddingTop: spacing.md, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  chipTextSelected: { color: colors.primary },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    marginTop: spacing.md,
  },
  primaryButtonText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  message: { fontSize: 13, marginTop: spacing.md },
  error: { color: colors.danger },
  success: { color: colors.success },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  infoBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  infoLabel: { color: colors.textMuted, fontSize: 14 },
  infoValue: { flexShrink: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  signOutButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  signOutText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
});

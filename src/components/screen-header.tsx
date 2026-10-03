import { createThemedStyleSheet } from '../providers/theme-provider';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { spacing } from '../constants/theme';

export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/dashboard');
}

export function ScreenHeader({ title }: { title: string }) {
  return (
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
      <Text style={styles.title}>{title}</Text>
      <View style={styles.spacer} />
    </View>
  );
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  backButton: { minWidth: 64, minHeight: 40, justifyContent: 'center' },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  spacer: { minWidth: 64 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  pressed: { opacity: 0.75 },
}));

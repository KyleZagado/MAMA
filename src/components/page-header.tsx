import type { Session } from '@supabase/supabase-js';
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { ProfileButton } from './profile-button';
import { spacing } from '../constants/theme';
import { createThemedStyleSheet } from '../providers/theme-provider';

type Props = {
  session: Session;
  title: string;
  actions?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function PageHeader({ session, title, actions, style }: Props) {
  const caption = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return (
    <View style={[styles.header, style]}>
      <View style={styles.titleBlock}>
        <Text style={styles.caption} numberOfLines={1}>
          {caption.toUpperCase()}
        </Text>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <View style={styles.actions}>
        {actions}
        <ProfileButton session={session} />
      </View>
    </View>
  );
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 52,
    marginBottom: spacing.lg,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  caption: { color: colors.textSubtle, fontSize: 11, fontWeight: '600', letterSpacing: 0.8 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingBottom: 2 },
}));

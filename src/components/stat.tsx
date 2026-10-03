import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { lightColors as colors, radius, spacing } from '../constants/theme';

export function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={styles.unit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: {
    flexGrow: 1,
    flexBasis: '45%',
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.textSubtle, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  value: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: spacing.xs },
  unit: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
});

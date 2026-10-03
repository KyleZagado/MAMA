import { createThemedStyleSheet } from '../providers/theme-provider';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { lightColors as colors, radius, spacing } from '../constants/theme';

// Android opens a dialog, iOS renders the native compact picker.
export function PickerField({
  mode,
  value,
  onChange,
}: {
  mode: 'date' | 'time';
  value: Date;
  onChange: (date: Date) => void;
}) {
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        mode={mode}
        display="compact"
        value={value}
        accentColor={colors.primary}
        onValueChange={(_event, date) => onChange(date)}
      />
    );
  }
  const label =
    mode === 'date'
      ? value.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return (
    <Pressable
      onPress={() =>
        DateTimePickerAndroid.open({ mode, value, onValueChange: (_event, date) => onChange(date) })
      }
      style={styles.pickerButton}
      accessibilityRole="button"
    >
      <Text style={styles.pickerText}>{label}</Text>
    </Pressable>
  );
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  pickerButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  pickerText: { color: colors.text, fontSize: 14, fontWeight: '600' },
}));

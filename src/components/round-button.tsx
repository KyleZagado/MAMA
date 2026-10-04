import { createThemedStyleSheet } from '../providers/theme-provider';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import type { IconName } from '../constants/finance';
import { lightColors as colors } from '../constants/theme';

type Props = {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
  iconSize?: number;
  color?: string;
};

export function RoundButton({
  icon,
  label,
  onPress,
  disabled,
  size = 44,
  iconSize = 20,
  color = colors.heroBackground,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={size < 44 ? (44 - size) / 2 : undefined}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderRadius: size / 2 },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Ionicons name={icon} size={iconSize} color={color} />
    </Pressable>
  );
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
}));

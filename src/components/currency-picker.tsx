import { createThemedStyleSheet } from '../providers/theme-provider';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CURRENCIES, currencyLabel } from '../constants/currencies';
import { lightColors as colors, radius, spacing } from '../constants/theme';

type Props = { value: string; onChange: (code: string) => void };

export function CurrencyPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return CURRENCIES;
    return CURRENCIES.filter(
      (item) => item.code.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle),
    );
  }, [query]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Currency, ${currencyLabel(value)}`}
      >
        <Text style={styles.triggerText} numberOfLines={1}>
          {currencyLabel(value)}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSubtle} />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
        onRequestClose={close}
      >
        <SafeAreaView style={styles.sheet} edges={Platform.OS === 'ios' ? [] : ['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.title}>Currency</Text>
            <Pressable onPress={close} hitSlop={8} accessibilityRole="button">
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search currency"
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={styles.search}
            accessibilityLabel="Search currency"
          />
          <FlatList
            data={results}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.empty}>No currencies match your search.</Text>}
            renderItem={({ item }) => {
              const selected = item.code === value;
              return (
                <Pressable
                  onPress={() => {
                    onChange(item.code);
                    close();
                  }}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={styles.code}>{item.code}</Text>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  pressed: { opacity: 0.75 },
  trigger: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  triggerText: { flex: 1, color: colors.text, fontSize: 16 },
  sheet: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: spacing.lg,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  close: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  search: {
    minHeight: 48,
    marginHorizontal: 22,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  code: { width: 48, color: colors.text, fontSize: 16, fontWeight: '700' },
  name: { flex: 1, color: colors.textMuted, fontSize: 15 },
  empty: { color: colors.textMuted, fontSize: 14, padding: 22 },
}));

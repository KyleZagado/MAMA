import { createThemedStyleSheet } from '../providers/theme-provider';
import type { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import React from 'react';
import { Image, Pressable, StyleSheet, Text } from 'react-native';

function initial(session: Session) {
  const name = session.user.user_metadata?.display_name;
  const source =
    typeof name === 'string' && name.trim() ? name.trim() : (session.user.email ?? 'U');
  return source.charAt(0).toUpperCase();
}

export function ProfileButton({ session }: { session: Session }) {
  const photo = session.user.user_metadata?.avatar_url;
  return (
    <Pressable
      onPress={() => router.push('/profile')}
      hitSlop={4}
      style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
    >
      {typeof photo === 'string' && photo ? (
        <Image source={{ uri: photo }} style={styles.image} />
      ) : (
        <Text style={styles.initial}>{initial(session)}</Text>
      )}
    </Pressable>
  );
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  avatar: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
  },
  image: { width: '100%', height: '100%' },
  initial: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.75 },
}));

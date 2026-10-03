import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { lightColors as colors } from '../constants/theme';
import { useAuth } from '../providers/auth-provider';
import { createThemedStyleSheet, useTheme } from '../providers/theme-provider';

export default function IndexRoute() {
  const { session, isLoading } = useAuth();
  useTheme();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return <Redirect href={session ? '/dashboard' : '/sign-in'} />;
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
}));

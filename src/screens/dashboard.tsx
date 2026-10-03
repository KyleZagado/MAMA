import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TransactionRow } from '../components/transaction-row';
import { accountTypeInfo } from '../constants/finance';
import { lightColors as colors, MAX_CONTENT_WIDTH, radius, spacing } from '../constants/theme';
import { useCurrency } from '../hooks/use-currency';
import { useFinance } from '../hooks/use-finance';
import { supabase } from '../lib/supabase';
import { formatMoney } from '../lib/money';

type DashboardProps = {
  session: Session;
};

const RECENT_LIMIT = 5;

function firstName(session: Session) {
  const fullName = session.user.user_metadata?.display_name;
  return typeof fullName === 'string' && fullName.trim()
    ? fullName.trim().split(/\s+/)[0]
    : (session.user.email?.split('@')[0] ?? 'there');
}

function photoUrl(session: Session) {
  const url = session.user.user_metadata?.avatar_url;
  return typeof url === 'string' && url ? url : null;
}

export function Dashboard({ session }: DashboardProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const { wallets, transactions, totalMinor, goalMinor, changePercent, isLoading, error } =
    useFinance(session.user.id, RECENT_LIMIT);

  const currency = useCurrency();
  const photo = photoUrl(session);
  const goalProgress = goalMinor ? Math.max(0, Math.min(totalMinor / goalMinor, 1)) : 0;

  async function handleSignOut() {
    if (!supabase) return;
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      const { error: signOutFailure } = await supabase.auth.signOut();
      if (signOutFailure) throw signOutFailure;
    } catch (failure: unknown) {
      setSignOutError(failure instanceof Error ? failure.message : 'Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  }

  function addTransaction() {
    router.push(wallets.length ? '/add-transaction' : '/wallet-form');
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>mama</Text>
            <Text style={styles.greeting}>Hi, {firstName(session)}</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => router.push('/profile')}
              style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
            >
              {photo ? (
                <Image source={{ uri: photo }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{firstName(session).charAt(0).toUpperCase()}</Text>
              )}
            </Pressable>
            <Pressable
              onPress={handleSignOut}
              disabled={isSigningOut}
              style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              {isSigningOut ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text style={styles.signOutText}>Sign out</Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.heroLabel}>Total Stash Balance</Text>
            {changePercent !== null && (
              <View style={styles.pill}>
                <Text style={styles.pillText}>
                  {changePercent > 0 ? '+' : ''}
                  {changePercent.toFixed(1)}%
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.heroAmount} adjustsFontSizeToFit numberOfLines={1}>
            {formatMoney(totalMinor, { currency })}
          </Text>
          {goalMinor ? (
            <Pressable onPress={() => router.push('/wallets')} style={styles.goalRow}>
              <Text style={styles.goalText}>Goal: {formatMoney(goalMinor, { currency, compact: true })}</Text>
              <View
                style={styles.track}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: Math.round(goalProgress * 100) }}
              >
                <View style={[styles.fill, { width: `${goalProgress * 100}%` }]} />
              </View>
            </Pressable>
          ) : (
            <Pressable onPress={() => router.push('/wallets')} style={styles.goalRow}>
              <Text style={styles.goalText}>Set a savings goal</Text>
              <View style={styles.track} />
            </Pressable>
          )}
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>My Wallets</Text>
          <Pressable onPress={() => router.push('/wallets')} hitSlop={8}>
            <Text style={styles.sectionLink}>Manage</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.walletScroll}
          nestedScrollEnabled
          contentContainerStyle={styles.walletRow}
        >
          {wallets.map((wallet) => {
            const info = accountTypeInfo(wallet.type);
            return (
              <Pressable
                key={wallet.id}
                onPress={() => router.push({ pathname: '/wallet-form', params: { id: wallet.id } })}
                style={({ pressed }) => [styles.walletCard, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${wallet.name}, ${formatMoney(wallet.balance_minor, { currency })}`}
              >
                <View style={styles.walletTop}>
                  <View style={[styles.walletIcon, { backgroundColor: info.background }]}>
                    <Ionicons name={info.icon} size={22} color={info.foreground} />
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
                </View>
                <Text style={styles.walletName} numberOfLines={1}>
                  {wallet.name}
                </Text>
                <Text style={styles.walletBalance} numberOfLines={1}>
                  {formatMoney(wallet.balance_minor, { currency, compact: true })}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => router.push('/wallet-form')}
            style={({ pressed }) => [styles.walletCard, styles.addCard, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Add wallet"
          >
            <Ionicons name="add-circle-outline" size={30} color={colors.primary} />
            <Text style={styles.addText}>Add wallet</Text>
          </Pressable>
        </ScrollView>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <Pressable onPress={() => router.push('/transactions')} hitSlop={8}>
            <Text style={styles.sectionLink}>See All</Text>
          </Pressable>
        </View>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : transactions.length ? (
          <View>
            {transactions.map((item, index) => (
              <TransactionRow key={item.id} item={item} showDivider={index < transactions.length - 1} />
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>
            {wallets.length
              ? 'No transactions yet. Tap + to add your first one.'
              : 'Create a wallet to start tracking your money.'}
          </Text>
        )}

        {error && <Text style={styles.error}>Could not load your data: {error}</Text>}
        {signOutError && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            Could not sign out: {signOutError}
          </Text>
        )}
      </ScrollView>

      <Pressable
        onPress={addTransaction}
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
      >
        <Ionicons name="add" size={30} color={colors.onPrimary} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: spacing.md,
    paddingBottom: 110,
  },
  pressed: { opacity: 0.75 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  greeting: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.8 },
  avatar: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: colors.primary, fontSize: 17, fontWeight: '700' },
  signOutButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
  },
  signOutText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  hero: {
    padding: 24,
    borderRadius: 32,
    backgroundColor: colors.heroBackground,
    gap: spacing.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabel: { color: colors.heroTextMuted, fontSize: 16 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  pillText: { color: colors.heroBackground, fontSize: 13, fontWeight: '700' },
  heroAmount: { color: colors.heroText, fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.xs },
  goalText: { color: colors.heroTextMuted, fontSize: 14 },
  track: {
    flex: 1,
    height: 6,
    overflow: 'hidden',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: { color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  sectionLink: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  walletScroll: { marginHorizontal: -22 },
  walletRow: { paddingHorizontal: 22, gap: spacing.md },
  walletCard: {
    width: 156,
    padding: spacing.lg,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  walletTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  walletIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  walletName: { color: colors.textMuted, fontSize: 15 },
  walletBalance: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 2 },
  addCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  addText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  loading: { marginVertical: spacing.xl },
  empty: { color: colors.textMuted, fontSize: 14, paddingVertical: spacing.lg },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.lg },
  fab: {
    position: 'absolute',
    right: 22,
    bottom: 28,
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 29,
    backgroundColor: colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});

import type { Session } from '@supabase/supabase-js';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../lib/supabase';

type DashboardProps = {
  session: Session;
};

const transactions = [
  {
    merchant: 'Grocery market',
    category: 'Food & groceries',
    amount: '-$84.20',
    mark: 'G',
    color: '#EAF2E9',
  },
  {
    merchant: 'Monthly salary',
    category: 'Income',
    amount: '+$3,250.00',
    mark: '↗',
    color: '#E4F3EA',
  },
  {
    merchant: 'Electric bill',
    category: 'Home & utilities',
    amount: '-$96.40',
    mark: '⌂',
    color: '#F4EEE5',
  },
];

function firstName(session: Session) {
  const fullName = session.user.user_metadata?.display_name;
  return typeof fullName === 'string' && fullName.trim()
    ? fullName.trim().split(/\s+/)[0]
    : session.user.email?.split('@')[0] ?? 'there';
}

export function Dashboard({ session }: DashboardProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function handleSignOut() {
    if (!supabase) return;
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error: unknown) {
      setSignOutError(
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>mama</Text>
            <Text style={styles.greeting}>Hi, {firstName(session)}</Text>
          </View>
          <View style={styles.headerActions}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {firstName(session).charAt(0).toUpperCase()}
              </Text>
            </View>
            <Pressable
              onPress={handleSignOut}
              disabled={isSigningOut}
              style={({ pressed }) => [
                styles.signOutButton,
                pressed && styles.signOutButtonPressed,
              ]}
              accessibilityRole="button"
            >
            {isSigningOut ? (
              <ActivityIndicator color="#16745A" size="small" />
            ) : (
                <Text style={styles.signOutText}>Sign out</Text>
            )}
            </Pressable>
          </View>
        </View>

        <View style={styles.sampleBanner}>
          <View style={styles.sampleDot} />
          <Text style={styles.sampleText}>
            Sample dashboard · Connect your accounts to see your numbers
          </Text>
        </View>

        <View style={styles.balanceCard}>
          <View style={styles.balanceTopRow}>
            <Text style={styles.balanceLabel}>TOTAL BALANCE</Text>
            <Text style={styles.period}>THIS MONTH</Text>
          </View>
          <Text style={styles.balanceAmount}>$12,450.80</Text>
          <View style={styles.balanceChange}>
            <Text style={styles.changePill}>↗ 8.2%</Text>
            <Text style={styles.changeCaption}>compared to last month</Text>
          </View>
          <View style={styles.balanceRule} />
          <View style={styles.balanceFooter}>
            <View>
              <Text style={styles.balanceFooterLabel}>INCOME</Text>
              <Text style={styles.balanceFooterValue}>$4,250.00</Text>
            </View>
            <View style={styles.balanceDivider} />
            <View>
              <Text style={styles.balanceFooterLabel}>SPENDING</Text>
              <Text style={styles.balanceFooterValue}>$2,180.40</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Monthly spending</Text>
        </View>
        <View style={styles.spendingCard}>
          <View style={styles.spendingInfo}>
            <View>
              <Text style={styles.spendingCaption}>You’ve used</Text>
              <Text style={styles.spendingTotal}>
                $2,180 <Text style={styles.spendingOf}>of $3,000</Text>
              </Text>
            </View>
            <Text style={styles.spendingPercent}>73%</Text>
          </View>
          <View
            style={styles.progressTrack}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: 73 }}
          >
            <View style={styles.progressValue} />
          </View>
          <Text style={styles.remainingText}>
            $820 left in your monthly budget
          </Text>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
        </View>
        <View style={styles.transactionCard}>
          {transactions.map((transaction, index) => (
            <View
              key={transaction.merchant}
              style={[
                styles.transactionRow,
                index < transactions.length - 1 && styles.transactionBorder,
              ]}
            >
              <View
                style={[
                  styles.transactionMark,
                  { backgroundColor: transaction.color },
                ]}
              >
                <Text style={styles.transactionMarkText}>
                  {transaction.mark}
                </Text>
              </View>
              <View style={styles.transactionDetails}>
                <Text style={styles.transactionMerchant}>
                  {transaction.merchant}
                </Text>
                <Text style={styles.transactionCategory}>
                  {transaction.category}
                </Text>
              </View>
              <Text
                style={[
                  styles.transactionAmount,
                  transaction.amount.startsWith('+') && styles.incomeAmount,
                ]}
              >
                {transaction.amount}
              </Text>
            </View>
          ))}
        </View>

        {signOutError && (
          <Text style={styles.signOutError} accessibilityLiveRegion="polite">
            Could not sign out: {signOutError}
          </Text>
        )}
        <Text style={styles.disclaimer}>
          Demo figures only. Your real financial data is not connected yet.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F8F7',
  },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brand: {
    color: '#16745A',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  greeting: {
    color: '#17342C',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  avatar: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#E2F0E9',
    borderWidth: 1,
    borderColor: '#D2E6DA',
  },
  avatarText: {
    color: '#16745A',
    fontSize: 17,
    fontWeight: '700',
  },
  signOutButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#EAF1ED',
  },
  signOutButtonPressed: {
    opacity: 0.75,
  },
  signOutText: {
    color: '#386653',
    fontSize: 12,
    fontWeight: '600',
  },
  sampleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: '#EDF2EF',
  },
  sampleDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#C4833D',
  },
  sampleText: {
    flex: 1,
    color: '#66776E',
    fontSize: 11,
    lineHeight: 16,
  },
  balanceCard: {
    overflow: 'hidden',
    padding: 21,
    borderRadius: 24,
    backgroundColor: '#155C49',
  },
  balanceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceLabel: {
    color: '#B9D7CB',
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  period: {
    color: '#D5E8DF',
    fontSize: 9,
    letterSpacing: 0.5,
    fontWeight: '700',
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#286D59',
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1.3,
    marginTop: 19,
  },
  balanceChange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 9,
  },
  changePill: {
    color: '#B9F0D4',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: '#26745C',
  },
  changeCaption: {
    color: '#BDD5CB',
    fontSize: 11,
  },
  balanceRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#4B806F',
    marginTop: 22,
    marginBottom: 17,
  },
  balanceFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  balanceFooterLabel: {
    color: '#B9D7CB',
    fontSize: 9,
    letterSpacing: 1.1,
    fontWeight: '700',
    marginBottom: 7,
  },
  balanceFooterValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  balanceDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: '#4B806F',
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 27,
    marginBottom: 13,
  },
  sectionTitle: {
    color: '#17342C',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  spendingCard: {
    padding: 17,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#E8ECE9',
    backgroundColor: '#FFFFFF',
  },
  spendingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  spendingCaption: {
    color: '#7F8C85',
    fontSize: 12,
    marginBottom: 5,
  },
  spendingTotal: {
    color: '#17342C',
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  spendingOf: {
    color: '#9AA69F',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0,
  },
  spendingPercent: {
    color: '#16745A',
    fontSize: 15,
    fontWeight: '700',
  },
  progressTrack: {
    height: 8,
    overflow: 'hidden',
    borderRadius: 5,
    backgroundColor: '#E9EFEB',
  },
  progressValue: {
    width: '73%',
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#48A27C',
  },
  remainingText: {
    color: '#78877F',
    fontSize: 11,
    marginTop: 11,
  },
  transactionCard: {
    paddingHorizontal: 15,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#E8ECE9',
    backgroundColor: '#FFFFFF',
  },
  transactionRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  transactionBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8ECE9',
  },
  transactionMark: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  transactionMarkText: {
    color: '#326D56',
    fontSize: 16,
    fontWeight: '700',
  },
  transactionDetails: {
    flex: 1,
  },
  transactionMerchant: {
    color: '#263D34',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  transactionCategory: {
    color: '#8A9690',
    fontSize: 11,
  },
  transactionAmount: {
    color: '#263D34',
    fontSize: 13,
    fontWeight: '700',
  },
  incomeAmount: {
    color: '#29805C',
  },
  signOutError: {
    color: '#A23F36',
    fontSize: 12,
    marginTop: 14,
  },
  disclaimer: {
    color: '#98A49D',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 22,
  },
});

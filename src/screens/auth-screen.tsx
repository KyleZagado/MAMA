import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase, supabaseConfigError } from '../lib/supabase';
import { useAuth } from '../providers/auth-provider';
import { createThemedStyleSheet, useThemeColors } from '../providers/theme-provider';

type AuthScreenProps = {
  mode: 'sign-in' | 'sign-up';
};

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function AuthScreen({ mode }: AuthScreenProps) {
  const colors = useThemeColors();
  const isSignUp = mode === 'sign-up';
  const { initializationError } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit() {
    setErrorMessage(null);
    setNotice(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes('@')) {
      setErrorMessage('Enter a valid email address.');
      return;
    }
    if (isSignUp && !name.trim()) {
      setErrorMessage('Enter your name to create an account.');
      return;
    }
    if (isSignUp && password.length < 8) {
      setErrorMessage('Your password must be at least 8 characters.');
      return;
    }
    if (!password) {
      setErrorMessage('Enter your password.');
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      setErrorMessage('Your passwords do not match.');
      return;
    }
    if (!supabase) {
      setErrorMessage(supabaseConfigError ?? 'Supabase is not configured.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: { display_name: name.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice('Account created. Check your email to confirm your address, then sign in.');
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) throw error;
      }

      router.replace('/dashboard');
    } catch (error: unknown) {
      setErrorMessage(messageFromError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>m</Text>
            </View>
            <Text style={styles.brandName}>mama</Text>
          </View>

          <View style={styles.intro}>
            <Text style={styles.eyebrow}>YOUR MONEY, IN BALANCE</Text>
            <Text style={styles.title}>
              {isSignUp ? 'A clearer picture starts here.' : 'Good to see you again.'}
            </Text>
            <Text style={styles.subtitle}>
              {isSignUp
                ? 'Create your account and make every part of your money easier to understand.'
                : 'Sign in to pick up where you left off and keep your finances in view.'}
            </Text>
          </View>

          <View style={styles.form}>
            {isSignUp && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Full name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor={colors.textSubtle}
                  autoCapitalize="words"
                  autoComplete="name"
                  returnKeyType="next"
                  style={styles.input}
                  accessibilityLabel="Full name"
                />
              </View>
            )}

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textSubtle}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                style={styles.input}
                accessibilityLabel="Email address"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordField}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder={isSignUp ? 'At least 8 characters' : 'Your password'}
                  placeholderTextColor={colors.textSubtle}
                  autoCapitalize="none"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  textContentType={isSignUp ? 'newPassword' : 'password'}
                  secureTextEntry={!showPassword}
                  returnKeyType={isSignUp ? 'next' : 'done'}
                  onSubmitEditing={isSignUp ? undefined : handleSubmit}
                  style={styles.passwordInput}
                  accessibilityLabel="Password"
                />
                <Pressable
                  onPress={() => setShowPassword((visible) => !visible)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  hitSlop={10}
                >
                  <Text style={styles.showPassword}>{showPassword ? 'HIDE' : 'SHOW'}</Text>
                </Pressable>
              </View>
            </View>

            {isSignUp && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Repeat password</Text>
                <View style={styles.passwordField}>
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Re-enter your password"
                    placeholderTextColor={colors.textSubtle}
                    autoCapitalize="none"
                    autoComplete="new-password"
                    textContentType="newPassword"
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                    style={styles.passwordInput}
                    accessibilityLabel="Repeat password"
                  />
                </View>
                {confirmPassword.length > 0 && confirmPassword !== password && (
                  <Text style={styles.mismatchText}>Passwords do not match yet.</Text>
                )}
              </View>
            )}

            {supabaseConfigError && (
              <View style={styles.configNotice}>
                <Text style={styles.configNoticeText}>{supabaseConfigError}</Text>
              </View>
            )}
            {initializationError && (
              <View style={styles.errorNotice} accessibilityLiveRegion="polite">
                <Text style={styles.errorText}>
                  Could not restore your session: {initializationError}
                </Text>
              </View>
            )}
            {errorMessage && (
              <View style={styles.errorNotice} accessibilityLiveRegion="polite">
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}
            {notice && (
              <View style={styles.successNotice} accessibilityLiveRegion="polite">
                <Text style={styles.successText}>{notice}</Text>
              </View>
            )}

            <Pressable
              onPress={handleSubmit}
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && !isSubmitting && styles.buttonPressed,
                isSubmitting && styles.buttonDisabled,
              ]}
              accessibilityRole="button"
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isSignUp ? 'Create my account' : 'Sign in'}
                </Text>
              )}
            </Pressable>
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>
              {isSignUp ? 'Already have an account? ' : 'New to mama? '}
            </Text>
            <Link href={isSignUp ? '/sign-in' : '/sign-up'} style={styles.switchLink}>
              {isSignUp ? 'Sign in' : 'Create account'}
            </Link>
          </View>

          <Text style={styles.footerText}>
            Your financial data is personal. We treat it that way.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 26,
    paddingTop: 18,
    paddingBottom: 28,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 48,
  },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: colors.onPrimary,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '700',
  },
  brandName: {
    color: colors.text,
    fontSize: 20,
    letterSpacing: -0.7,
    fontWeight: '700',
  },
  intro: {
    marginBottom: 30,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -1.2,
    fontWeight: '700',
    marginBottom: 12,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 23,
  },
  form: {
    gap: 18,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    fontSize: 15,
  },
  passwordField: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: 16,
    paddingRight: 15,
    backgroundColor: colors.surface,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 15,
  },
  mismatchText: {
    color: colors.danger,
    fontSize: 12,
  },
  showPassword: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  configNotice: {
    padding: 13,
    borderRadius: 12,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  configNoticeText: {
    color: colors.warning,
    fontSize: 13,
    lineHeight: 19,
  },
  errorNotice: {
    padding: 13,
    borderRadius: 12,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  successNotice: {
    padding: 13,
    borderRadius: 12,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  successText: {
    color: colors.success,
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonDisabled: {
    opacity: 0.68,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 26,
  },
  switchText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  switchLink: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  footerText: {
    color: colors.textSubtle,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 'auto',
    paddingTop: 38,
  },
}));

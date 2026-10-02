import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>Mobile App</Text>
        <Text style={styles.title}>MAMA</Text>
        <Text style={styles.subtitle}>
          This is a starter screen for an Android and iOS app.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What you can add next</Text>
          <Text style={styles.cardText}>• Product catalogue</Text>
          <Text style={styles.cardText}>• Cart and checkout flow</Text>
          <Text style={styles.cardText}>• User login and profile</Text>
          <Text style={styles.cardText}>• Orders and tracking</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  eyebrow: {
    color: '#7c3aed',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#111827',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 12,
  },
  subtitle: {
    color: '#4b5563',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  cardText: {
    color: '#374151',
    fontSize: 15,
    lineHeight: 24,
  },
});

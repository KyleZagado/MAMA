import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import type { NotificationPermissionsStatus } from 'expo-notifications';

const CHANNEL_ID = 'journal-reminders';
type NotificationsModule = typeof import('expo-notifications');
type ReminderResult = { permissionGranted: boolean; supported: boolean };

let notificationsModule: Promise<NotificationsModule> | null = null;

function loadNotifications() {
  notificationsModule ??= import('expo-notifications');
  return notificationsModule;
}

async function prepareAndroidChannel(Notifications: NotificationsModule) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Journal reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

function hasPermission(permission: NotificationPermissionsStatus) {
  return permission.granted;
}

async function cancelJournalReminders(Notifications: NotificationsModule) {
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    existing
      .filter((item) => item.content.data?.journalReminder === true)
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
  );
}

export async function requestJournalReminderPermission() {
  if (isAndroidExpoGo()) return { permissionGranted: false, supported: false };
  const Notifications = await loadNotifications();
  await prepareAndroidChannel(Notifications);
  const current = await Notifications.getPermissionsAsync();
  const permission = hasPermission(current)
    ? current
    : await Notifications.requestPermissionsAsync();
  return { permissionGranted: hasPermission(permission), supported: true };
}

export async function syncJournalReminder(enabled: boolean, time: string): Promise<ReminderResult> {
  if (isAndroidExpoGo()) return { permissionGranted: false, supported: false };
  const Notifications = await loadNotifications();
  await cancelJournalReminders(Notifications);
  if (!enabled) return { permissionGranted: false, supported: true };

  const permission = await Notifications.getPermissionsAsync();
  if (!hasPermission(permission)) return { permissionGranted: false, supported: true };

  const [hour, minute] = time.split(':').map(Number);
  await prepareAndroidChannel(Notifications);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'A moment for your journal',
      body: 'Take a few minutes to write about your day.',
      data: { journalReminder: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: CHANNEL_ID,
    },
  });
  return { permissionGranted: true, supported: true };
}

function isAndroidExpoGo() {
  return Platform.OS === 'android' && isRunningInExpoGo();
}

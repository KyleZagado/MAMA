import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import type { SQLiteDatabase } from 'expo-sqlite';

import { listWorkoutScheduleInstances } from '../database/workout-schedules';
import { addDaysToKey, fromDateKey, toDateKey } from './dates';

const CHANNEL_ID = 'workout-reminders';
const MAX_PENDING_WORKOUT_REMINDERS = 50;

type NotificationsModule = typeof import('expo-notifications');

export type WorkoutReminderSyncResult = {
  permissionGranted: boolean;
  omitted: number;
  unavailableInExpoGo: boolean;
};

function isAndroidExpoGo() {
  return Platform.OS === 'android' && isRunningInExpoGo();
}

let notificationsModule: Promise<NotificationsModule> | null = null;

function loadNotifications() {
  notificationsModule ??= import('expo-notifications');
  return notificationsModule;
}

async function prepareAndroidChannel(Notifications: NotificationsModule) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Workout reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

export async function requestWorkoutReminderPermission() {
  if (isAndroidExpoGo()) {
    return { granted: false, unavailableInExpoGo: true };
  }

  const Notifications = await loadNotifications();
  await prepareAndroidChannel(Notifications);
  const current = await Notifications.getPermissionsAsync();
  const permission =
    current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
      ? current
      : await Notifications.requestPermissionsAsync();
  return {
    granted:
      permission.granted ||
      permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL,
    unavailableInExpoGo: false,
  };
}

export async function syncWorkoutReminders(db: SQLiteDatabase) {
  if (isAndroidExpoGo()) {
    return { permissionGranted: false, omitted: 0, unavailableInExpoGo: true };
  }

  const Notifications = await loadNotifications();
  await prepareAndroidChannel(Notifications);
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    existing
      .filter((notification) => notification.content.data?.workoutScheduleReminder === true)
      .map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier)),
  );

  const permission = await Notifications.getPermissionsAsync();
  const permissionGranted =
    permission.granted ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!permissionGranted) {
    return { permissionGranted: false, omitted: 0, unavailableInExpoGo: false };
  }

  const today = toDateKey(new Date());
  const through = addDaysToKey(today, 90);
  const upcoming = await listWorkoutScheduleInstances(db, today, through);
  const allReminders = upcoming
    .filter(
      (instance) =>
        instance.kind === 'workout' &&
        instance.status === 'scheduled' &&
        instance.reminderMinutes !== null &&
        instance.startTime !== null,
    )
    .map((instance) => {
      const [hour, minute] = instance.startTime!.split(':').map(Number);
      const triggerAt = fromDateKey(instance.scheduledDate);
      triggerAt.setHours(hour, minute - instance.reminderMinutes!, 0, 0);
      return { instance, triggerAt };
    })
    .filter(({ triggerAt }) => triggerAt.getTime() > Date.now())
    .sort((a, b) => a.triggerAt.getTime() - b.triggerAt.getTime());
  const reminders = allReminders.slice(0, MAX_PENDING_WORKOUT_REMINDERS);

  await Promise.all(
    reminders.map(({ instance, triggerAt }) =>
      Notifications.scheduleNotificationAsync({
        content: {
          title: 'Workout coming up',
          body: `${instance.title} starts in ${instance.reminderMinutes} minutes.`,
          data: {
            workoutScheduleReminder: true,
            workoutScheduleId: instance.id.split(':')[0],
            workoutOccurrenceDate: instance.occurrenceDate,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerAt,
          channelId: CHANNEL_ID,
        },
      }),
    ),
  );
  return {
    permissionGranted: true,
    omitted: allReminders.length - reminders.length,
    unavailableInExpoGo: false,
  };
}

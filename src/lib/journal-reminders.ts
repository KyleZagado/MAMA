export async function requestJournalReminderPermission() {
  return { permissionGranted: false, supported: false };
}

export async function syncJournalReminder(_enabled: boolean, _time: string) {
  return { permissionGranted: false, supported: false };
}

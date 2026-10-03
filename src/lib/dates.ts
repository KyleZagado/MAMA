// Calendar dates are 'YYYY-MM-DD' in local time and clock times are 'HH:mm'.

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDaysToKey(key: string, days: number) {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function toTimeKey(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function timeKeyToDate(key: string) {
  const [hours, minutes] = key.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function formatTimeKey(key: string) {
  return timeKeyToDate(key).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatDateKey(key: string, style: 'weekday' | 'short') {
  return fromDateKey(key).toLocaleDateString(
    'en-US',
    style === 'weekday' ? { weekday: 'long' } : { month: 'short', day: 'numeric' },
  );
}

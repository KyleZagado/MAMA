export type ActivityType = 'run' | 'walk' | 'ride';

export type RoutePoint = { latitude: number; longitude: number };

export const ACTIVITY_TYPES: {
  id: ActivityType;
  label: string;
  icon: 'walk-outline' | 'bicycle-outline' | 'speedometer-outline';
  maxSpeedMs: number;
}[] = [
  { id: 'run', label: 'Run', icon: 'speedometer-outline', maxSpeedMs: 12 },
  { id: 'walk', label: 'Walk', icon: 'walk-outline', maxSpeedMs: 6 },
  { id: 'ride', label: 'Ride', icon: 'bicycle-outline', maxSpeedMs: 25 },
];

export function activityInfo(type: string) {
  return ACTIVITY_TYPES.find((item) => item.id === type) ?? ACTIVITY_TYPES[0];
}

export const DEFAULT_WEIGHT_KG = 70;

export function haversineMeters(a: RoutePoint, b: RoutePoint) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

// MET-based estimate: kcal = MET × weight (kg) × hours, with MET scaled by average speed.
export function estimateCalories(type: ActivityType, weightKg: number, durationS: number, distanceM: number) {
  if (durationS <= 0) return 0;
  const hours = durationS / 3600;
  const speedKmh = distanceM / 1000 / hours;
  const met =
    type === 'run'
      ? Math.max(6, speedKmh)
      : type === 'walk'
        ? 2.5 + 0.2 * Math.min(speedKmh, 8)
        : Math.max(4, 1 + 0.4 * speedKmh);
  return Math.round(met * weightKg * hours);
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatKm(distanceM: number) {
  return (distanceM / 1000).toFixed(2);
}

// Pace for run and walk, speed for rides.
export function formatPace(type: ActivityType, durationS: number, distanceM: number) {
  if (distanceM < 10 || durationS <= 0) return { value: '--', unit: type === 'ride' ? 'km/h' : '/km' };
  if (type === 'ride') {
    return { value: (distanceM / 1000 / (durationS / 3600)).toFixed(1), unit: 'km/h' };
  }
  const secondsPerKm = durationS / (distanceM / 1000);
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return minutes > 99 ? { value: '--', unit: '/km' } : { value: `${minutes}:${String(seconds).padStart(2, '0')}`, unit: '/km' };
}

export function downsample(points: RoutePoint[], limit = 400) {
  if (points.length <= limit) return points;
  const step = (points.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => points[Math.round(index * step)]);
}

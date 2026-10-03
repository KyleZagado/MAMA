import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { useCallback, useEffect, useRef, useState } from 'react';

import { activityInfo, haversineMeters, type ActivityType, type RoutePoint } from '../lib/activity';

type Status = 'idle' | 'running' | 'paused';

const MAX_ACCURACY_M = 30;
const MIN_SEGMENT_M = 3;
const KEEP_AWAKE_TAG = 'activity-tracking';

type Subscription = { remove: () => void };

// Records distance, route and steps while the app is open. Pausing drops both sensors so
// movement during a pause is not counted.
export function useActivityTracker(type: ActivityType) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [activeMs, setActiveMs] = useState(0);
  const [segmentStart, setSegmentStart] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [distanceM, setDistanceM] = useState(0);
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [stepsBase, setStepsBase] = useState(0);
  const [stepsLive, setStepsLive] = useState(0);
  const [stepsAvailable, setStepsAvailable] = useState(false);

  const locationSub = useRef<Subscription | null>(null);
  const stepSub = useRef<Subscription | null>(null);
  const lastPoint = useRef<{ point: RoutePoint; time: number } | null>(null);
  const stepsLiveRef = useRef(0);
  const maxSpeed = activityInfo(type).maxSpeedMs;

  const detach = useCallback(() => {
    locationSub.current?.remove();
    stepSub.current?.remove();
    locationSub.current = null;
    stepSub.current = null;
    lastPoint.current = null;
  }, []);

  const attach = useCallback(async () => {
    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 2000 },
      (location) => {
        const { latitude, longitude, accuracy } = location.coords;
        if (accuracy !== null && accuracy > MAX_ACCURACY_M) return;
        const point = { latitude, longitude };
        const previous = lastPoint.current;
        if (previous) {
          const meters = haversineMeters(previous.point, point);
          const seconds = Math.max(1, (location.timestamp - previous.time) / 1000);
          if (meters < MIN_SEGMENT_M || meters / seconds > maxSpeed) return;
          setDistanceM((total) => total + meters);
        }
        lastPoint.current = { point, time: location.timestamp };
        setPoints((list) => [...list, point]);
      },
    );

    if (type !== 'ride') {
      try {
        const permission = await Pedometer.requestPermissionsAsync();
        if (permission.granted && (await Pedometer.isAvailableAsync())) {
          setStepsAvailable(true);
          stepSub.current = Pedometer.watchStepCount((result) => {
            stepsLiveRef.current = result.steps;
            setStepsLive(result.steps);
          });
        }
      } catch {
        setStepsAvailable(false);
      }
    }
  }, [maxSpeed, type]);

  const bankSegment = useCallback(() => {
    detach();
    setActiveMs((total) => total + (segmentStart ? Date.now() - segmentStart : 0));
    setSegmentStart(null);
    setStepsBase((base) => base + stepsLiveRef.current);
    stepsLiveRef.current = 0;
    setStepsLive(0);
  }, [detach, segmentStart]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError('Allow location access in Settings to record distance and your route.');
        return;
      }
      const time = Date.now();
      setStartedAt(time);
      setNow(time);
      setSegmentStart(time);
      setStatus('running');
      await attach();
    } catch (e: unknown) {
      detach();
      setStatus('idle');
      setSegmentStart(null);
      setError(e instanceof Error ? e.message : 'Could not start tracking.');
    }
  }, [attach, detach]);

  const pause = useCallback(() => {
    bankSegment();
    setStatus('paused');
  }, [bankSegment]);

  const resume = useCallback(async () => {
    setError(null);
    const time = Date.now();
    setNow(time);
    setSegmentStart(time);
    setStatus('running');
    try {
      await attach();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not resume tracking.');
    }
  }, [attach]);

  useEffect(() => {
    if (status !== 'running') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      clearInterval(timer);
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [status]);

  useEffect(() => detach, [detach]);

  const elapsedS = (activeMs + (segmentStart ? now - segmentStart : 0)) / 1000;

  return {
    status,
    error,
    startedAt,
    elapsedS,
    distanceM,
    points,
    steps: stepsAvailable ? stepsBase + stepsLive : null,
    start,
    pause,
    resume,
  };
}

import type { Session } from '@supabase/supabase-js';

function positiveMetadataNumber(session: Session, key: string) {
  const raw = session.user.user_metadata?.[key];
  if (raw === '' || raw === null || raw === undefined) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Body weight saved in Profile, in kilograms. */
export function profileWeightKg(session: Session) {
  return positiveMetadataNumber(session, 'weight_kg');
}

/** Height saved in Profile, in centimetres. */
export function profileHeightCm(session: Session) {
  return positiveMetadataNumber(session, 'height_cm');
}

export function bodyMassIndex(weightKg: number | null, heightCm: number | null) {
  if (!weightKg || !heightCm) return null;
  const meters = heightCm / 100;
  return Math.round((weightKg / (meters * meters)) * 10) / 10;
}

export function bmiCategory(bmi: number) {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Healthy';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

export function formatBodyNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

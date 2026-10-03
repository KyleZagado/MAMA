import type { MealType } from '../database/consumption';

export const MEAL_TYPES: { id: MealType; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snack', label: 'Snack' },
];

export function mealTypeLabel(type: string) {
  return MEAL_TYPES.find((item) => item.id === type)?.label ?? 'Meal';
}

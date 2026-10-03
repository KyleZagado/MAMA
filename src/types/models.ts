// Row types mirroring src/database/migrations.ts. Dates are local calendar
// dates ('YYYY-MM-DD'), clock times are 'HH:mm', and timestamps are epoch ms.
// Money is stored as integer minor units (for example centavos or cents).

export type Id = string;

export interface Timestamps {
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'none' | 'low' | 'medium' | 'high';

export interface Task extends Timestamps {
  id: Id;
  title: string;
  description: string | null;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  project_id: Id | null;
  category: string | null;
  start_date: string | null;
  due_date: string | null;
  start_time: string | null;
  end_time: string | null;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  location: string | null;
  recurrence_rule: string | null;
  completed_at: number | null;
}

export interface Subtask {
  id: Id;
  task_id: Id;
  title: string;
  done: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface Project extends Timestamps {
  id: Id;
  name: string;
  color: string | null;
  archived: number;
}

export interface Tag {
  id: Id;
  name: string;
  color: string | null;
}

export interface CalendarEvent extends Timestamps {
  id: Id;
  title: string;
  description: string | null;
  all_day: number;
  start_at: number;
  end_at: number | null;
  color: string | null;
  category: string | null;
  source_type: string | null;
  source_id: Id | null;
  recurrence_rule: string | null;
}

export interface Reminder {
  id: Id;
  owner_type: string;
  owner_id: Id;
  remind_at: number;
  notification_id: string | null;
  created_at: number;
}

export interface Workout extends Timestamps {
  id: Id;
  name: string;
  template_id: Id | null;
  scheduled_for: number | null;
  started_at: number | null;
  finished_at: number | null;
  notes: string | null;
}

export interface WorkoutSet {
  id: Id;
  workout_id: Id;
  exercise_id: Id;
  set_index: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  duration_s: number | null;
  distance_m: number | null;
  completed: number;
}

export interface Activity extends Timestamps {
  id: Id;
  type: string;
  started_at: number;
  ended_at: number | null;
  duration_s: number;
  distance_m: number;
  calories: number | null;
  elevation_gain_m: number | null;
  avg_heart_rate: number | null;
  notes: string | null;
}

export interface Meal extends Timestamps {
  id: Id;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink' | 'custom';
  eaten_at: number;
  food_id: Id | null;
  name: string;
  quantity: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  notes: string | null;
}

export interface WaterEntry {
  id: Id;
  amount_ml: number;
  logged_at: number;
  created_at: number;
  deleted_at: number | null;
}

export interface FastingSession extends Timestamps {
  id: Id;
  protocol: string;
  target_hours: number;
  started_at: number;
  ended_at: number | null;
}

export interface Account extends Timestamps {
  id: Id;
  name: string;
  type: 'cash' | 'bank' | 'ewallet' | 'credit_card' | 'custom';
  currency: string;
  opening_balance_minor: number;
  details: string | null;
}

export interface Transaction extends Timestamps {
  id: Id;
  type: 'income' | 'expense' | 'transfer';
  amount_minor: number;
  account_id: Id;
  to_account_id: Id | null;
  category_id: Id | null;
  occurred_at: number;
  description: string | null;
  notes: string | null;
  attachment_uri: string | null;
  subcategory: string | null;
  merchant: string | null;
  location: string | null;
  payment_method: string | null;
  tags: string | null;
  recurrence_rule: string | null;
}

export interface Bill extends Timestamps {
  id: Id;
  name: string;
  amount_minor: number;
  due_date: string;
  category_id: Id | null;
  account_id: Id | null;
  recurrence_rule: string | null;
  paid_at: number | null;
}

export interface SavingsGoal extends Timestamps {
  id: Id;
  name: string;
  target_minor: number;
  current_minor: number;
  target_date: string | null;
}

export type HomeWidgetId =
  | 'tasks'
  | 'calendar'
  | 'fitness'
  | 'workout'
  | 'hydration'
  | 'fasting'
  | 'nutrition'
  | 'finance'
  | 'budget'
  | 'savings';

export interface HomeWidgetPreference {
  id: HomeWidgetId;
  visible: boolean;
}

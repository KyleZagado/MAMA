export const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Legs',
  'Glutes',
  'Core',
  'Cardio',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export type Exercise = {
  id: string;
  name: string;
  group: MuscleGroup;
  equipment: string;
};

function make(group: MuscleGroup, items: [string, string][]): Exercise[] {
  return items.map(([name, equipment]) => ({
    id: `${group}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    group,
    equipment,
  }));
}

export const EXERCISES: Exercise[] = [
  ...make('Chest', [
    ['Barbell Bench Press', 'Barbell'],
    ['Incline Barbell Bench Press', 'Barbell'],
    ['Decline Bench Press', 'Barbell'],
    ['Dumbbell Bench Press', 'Dumbbell'],
    ['Incline Dumbbell Press', 'Dumbbell'],
    ['Dumbbell Fly', 'Dumbbell'],
    ['Cable Crossover', 'Cable'],
    ['Pec Deck Fly', 'Machine'],
    ['Chest Press Machine', 'Machine'],
    ['Push-Up', 'Bodyweight'],
    ['Chest Dip', 'Bodyweight'],
  ]),
  ...make('Back', [
    ['Deadlift', 'Barbell'],
    ['Barbell Row', 'Barbell'],
    ['Pendlay Row', 'Barbell'],
    ['Pull-Up', 'Bodyweight'],
    ['Chin-Up', 'Bodyweight'],
    ['Lat Pulldown', 'Cable'],
    ['Seated Cable Row', 'Cable'],
    ['One-Arm Dumbbell Row', 'Dumbbell'],
    ['T-Bar Row', 'Barbell'],
    ['Straight-Arm Pulldown', 'Cable'],
    ['Back Extension', 'Bodyweight'],
    ['Machine Row', 'Machine'],
  ]),
  ...make('Shoulders', [
    ['Overhead Press', 'Barbell'],
    ['Seated Dumbbell Press', 'Dumbbell'],
    ['Arnold Press', 'Dumbbell'],
    ['Lateral Raise', 'Dumbbell'],
    ['Front Raise', 'Dumbbell'],
    ['Rear Delt Fly', 'Dumbbell'],
    ['Face Pull', 'Cable'],
    ['Upright Row', 'Barbell'],
    ['Barbell Shrug', 'Barbell'],
    ['Shoulder Press Machine', 'Machine'],
  ]),
  ...make('Biceps', [
    ['Barbell Curl', 'Barbell'],
    ['Dumbbell Curl', 'Dumbbell'],
    ['Hammer Curl', 'Dumbbell'],
    ['Preacher Curl', 'Barbell'],
    ['Incline Dumbbell Curl', 'Dumbbell'],
    ['Cable Curl', 'Cable'],
    ['Concentration Curl', 'Dumbbell'],
  ]),
  ...make('Triceps', [
    ['Close-Grip Bench Press', 'Barbell'],
    ['Triceps Pushdown', 'Cable'],
    ['Overhead Triceps Extension', 'Dumbbell'],
    ['Skull Crusher', 'Barbell'],
    ['Triceps Dip', 'Bodyweight'],
    ['Cable Rope Overhead Extension', 'Cable'],
    ['Triceps Kickback', 'Dumbbell'],
  ]),
  ...make('Legs', [
    ['Barbell Back Squat', 'Barbell'],
    ['Front Squat', 'Barbell'],
    ['Leg Press', 'Machine'],
    ['Hack Squat', 'Machine'],
    ['Romanian Deadlift', 'Barbell'],
    ['Walking Lunge', 'Dumbbell'],
    ['Bulgarian Split Squat', 'Dumbbell'],
    ['Goblet Squat', 'Kettlebell'],
    ['Leg Extension', 'Machine'],
    ['Lying Leg Curl', 'Machine'],
    ['Standing Calf Raise', 'Machine'],
    ['Seated Calf Raise', 'Machine'],
  ]),
  ...make('Glutes', [
    ['Hip Thrust', 'Barbell'],
    ['Glute Bridge', 'Bodyweight'],
    ['Cable Kickback', 'Cable'],
    ['Sumo Deadlift', 'Barbell'],
    ['Step-Up', 'Dumbbell'],
    ['Hip Abduction Machine', 'Machine'],
    ['Kettlebell Swing', 'Kettlebell'],
  ]),
  ...make('Core', [
    ['Plank', 'Bodyweight'],
    ['Crunch', 'Bodyweight'],
    ['Hanging Leg Raise', 'Bodyweight'],
    ['Cable Crunch', 'Cable'],
    ['Russian Twist', 'Bodyweight'],
    ['Ab Wheel Rollout', 'Ab wheel'],
    ['Bicycle Crunch', 'Bodyweight'],
    ['Mountain Climber', 'Bodyweight'],
    ['Side Plank', 'Bodyweight'],
  ]),
  ...make('Cardio', [
    ['Treadmill Run', 'Cardio machine'],
    ['Stationary Bike', 'Cardio machine'],
    ['Rowing Machine', 'Cardio machine'],
    ['Elliptical', 'Cardio machine'],
    ['Stair Climber', 'Cardio machine'],
    ['Jump Rope', 'Rope'],
    ['Battle Ropes', 'Rope'],
    ['Outdoor Run', 'None'],
    ['Swimming', 'Pool'],
  ]),
];

export function exerciseById(id: string) {
  return EXERCISES.find((exercise) => exercise.id === id) ?? null;
}

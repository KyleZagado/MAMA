export type DropRect = { x: number; y: number; width: number; height: number };
export type TaskDropTarget = { kind: 'date' | 'task'; key: string; rect: DropRect };

export function findTaskDropTarget(targets: TaskDropTarget[], x: number, y: number) {
  return targets.find(({ rect }) => x >= rect.x && x <= rect.x + rect.width &&
    y >= rect.y && y <= rect.y + rect.height) ?? null;
}

export function taskDropOrder(ids: string[], movingId: string, target: TaskDropTarget, y: number) {
  if (target.kind !== 'task' || target.key === movingId || !ids.includes(movingId)) return null;
  const next = ids.filter((id) => id !== movingId);
  const index = next.indexOf(target.key);
  if (index < 0) return null;
  next.splice(index + (y > target.rect.y + target.rect.height / 2 ? 1 : 0), 0, movingId);
  return next;
}

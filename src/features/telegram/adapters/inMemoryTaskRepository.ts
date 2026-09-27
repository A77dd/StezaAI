import {
  AlreadyExistsError,
  compareByTimeThenId,
  InvalidTransitionError,
  NotFoundError,
} from "../domain";
import type { Task, TaskPatch, TaskRepository, TaskStatus } from "../domain";

const byCreation = compareByTimeThenId<Task>((task) => task.createdAt);

/** Same merge rules as `update`: `undefined` skips a key, identity fields are re-applied last. */
function applyPatch(existing: Task, patch: TaskPatch): Task {
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) merged[key] = structuredClone(value);
  }
  return {
    ...merged,
    id: existing.id,
    userId: existing.userId,
    createdAt: existing.createdAt,
  } as Task;
}

/**
 * Process-local task store for tests, demos and the first version. State is
 * lost on restart; a persistent adapter must satisfy the same contract.
 * Everything crossing the boundary is copied in both directions, and every
 * by-id operation is scoped to the owner: another user's task behaves exactly
 * like a missing one.
 */
export function createInMemoryTaskRepository(): TaskRepository {
  const tasks = new Map<string, Task>();

  const owned = (userId: string, id: string): Task | undefined => {
    const task = tasks.get(id);
    return task !== undefined && task.userId === userId ? task : undefined;
  };

  const listForUser = (userId: string): Task[] =>
    [...tasks.values()]
      .filter((task) => task.userId === userId)
      .sort(byCreation)
      .map((task) => structuredClone(task));

  return {
    async create(task) {
      if (tasks.has(task.id)) {
        throw new AlreadyExistsError(`Task ${task.id} already exists`);
      }
      tasks.set(task.id, structuredClone(task));
      return structuredClone(task);
    },

    async get(userId, id) {
      const task = owned(userId, id);
      return task === undefined ? null : structuredClone(task);
    },

    async update(userId, id, patch: TaskPatch) {
      const existing = owned(userId, id);
      if (existing === undefined) {
        throw new NotFoundError(`Task ${id} does not exist`);
      }
      const updated = applyPatch(existing, patch);
      tasks.set(id, updated);
      return structuredClone(updated);
    },

    // No `await` between the read and the write below, so two concurrent
    // calls racing the same task never interleave: whichever call's body runs
    // first (JS is single-threaded and this is all synchronous) completes the
    // check-and-set before the other one's body starts.
    async transition(userId, id, allowedFrom: readonly TaskStatus[], patch: TaskPatch) {
      const existing = owned(userId, id);
      if (existing === undefined) {
        throw new NotFoundError(`Task ${id} does not exist`);
      }
      if (!allowedFrom.includes(existing.status)) {
        throw new InvalidTransitionError(existing.status);
      }
      const updated = applyPatch(existing, patch);
      tasks.set(id, updated);
      return structuredClone(updated);
    },

    async listByUser(userId, filter) {
      const status = filter?.status;
      return listForUser(userId).filter((task) => status === undefined || task.status === status);
    },

    async deleteAllForUser(userId) {
      let removed = 0;
      for (const [id, task] of tasks) {
        if (task.userId === userId) {
          tasks.delete(id);
          removed += 1;
        }
      }
      return removed;
    },

    async exportForUser(userId) {
      return listForUser(userId);
    },
  };
}

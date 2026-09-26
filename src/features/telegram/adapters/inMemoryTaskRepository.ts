import {
  AlreadyExistsError,
  compareByTimeThenId,
  NotFoundError,
} from "../domain";
import type { Task, TaskPatch, TaskRepository } from "../domain";

const byCreation = compareByTimeThenId<Task>((task) => task.createdAt);

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
      const merged: Record<string, unknown> = { ...existing };
      for (const [key, value] of Object.entries(patch)) {
        // `undefined` means "not provided"; clearing a field takes an explicit null.
        if (value !== undefined) merged[key] = structuredClone(value);
      }
      // Identity fields are re-applied last so a patch can never rewrite them.
      const updated = {
        ...merged,
        id: existing.id,
        userId: existing.userId,
        createdAt: existing.createdAt,
      } as Task;
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

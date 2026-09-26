import { AlreadyExistsError, NotFoundError } from "../domain/errors";
import type { TaskPatch, TaskRepository } from "../domain/ports";
import { parseInstant } from "../domain/time";
import type { Task } from "../domain/types";

function compareTasks(a: Task, b: Task): number {
  const byTime = parseInstant(a.createdAt) - parseInstant(b.createdAt);
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Process-local task store for tests, demos and the first version. State is
 * lost on restart; a persistent adapter must satisfy the same contract.
 * Everything crossing the boundary is copied in both directions.
 */
export function createInMemoryTaskRepository(): TaskRepository {
  const tasks = new Map<string, Task>();

  const listForUser = (userId: string): Task[] =>
    [...tasks.values()]
      .filter((task) => task.userId === userId)
      .sort(compareTasks)
      .map((task) => structuredClone(task));

  return {
    async create(task) {
      if (tasks.has(task.id)) {
        throw new AlreadyExistsError(`Task ${task.id} already exists`);
      }
      tasks.set(task.id, structuredClone(task));
      return structuredClone(task);
    },

    async get(id) {
      const task = tasks.get(id);
      return task === undefined ? null : structuredClone(task);
    },

    async update(id, patch: TaskPatch) {
      const existing = tasks.get(id);
      if (existing === undefined) {
        throw new NotFoundError(`Task ${id} does not exist`);
      }
      // Identity fields are re-applied last so a patch can never rewrite them.
      const updated: Task = {
        ...existing,
        ...structuredClone(patch),
        id: existing.id,
        userId: existing.userId,
        createdAt: existing.createdAt,
      };
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

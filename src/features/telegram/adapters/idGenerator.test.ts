import { describe, expect, it } from "vitest";
import { InvalidArgumentError } from "../domain";
import { createSequentialIdGenerator, createUuidIdGenerator } from "./idGenerator";

describe("createSequentialIdGenerator", () => {
  it("counts per prefix starting at 1", () => {
    const ids = createSequentialIdGenerator();
    expect([ids.next("task"), ids.next("task"), ids.next("booking"), ids.next("task")]).toEqual([
      "task_1",
      "task_2",
      "booking_1",
      "task_3",
    ]);
  });

  it("is independent per generator instance", () => {
    createSequentialIdGenerator().next("task");
    expect(createSequentialIdGenerator().next("task")).toBe("task_1");
  });

  it.each(["", "Task", "a-b", "1abc", "a b"])("rejects prefix %j", (prefix) => {
    expect(() => createSequentialIdGenerator().next(prefix)).toThrow(InvalidArgumentError);
  });
});

describe("createUuidIdGenerator", () => {
  it("returns prefix + random UUID and never repeats", () => {
    const ids = createUuidIdGenerator();
    const a = ids.next("task");
    const b = ids.next("task");
    expect(a).toMatch(/^task_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });

  it("rejects an invalid prefix", () => {
    expect(() => createUuidIdGenerator().next("Bad Prefix")).toThrow(InvalidArgumentError);
  });
});

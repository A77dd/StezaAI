import { describe, expect, it } from "vitest";
import { createInMemoryCalendar } from "./inMemoryCalendar";
import { createSequentialIdGenerator } from "./idGenerator";
import { describeCalendarPortContract } from "../testing/contracts";
import { InvalidTimeError } from "../domain";

const createCalendar = () => createInMemoryCalendar({ ids: createSequentialIdGenerator() });

describeCalendarPortContract("inMemoryCalendar", () => ({ port: createCalendar() }));

describe("inMemoryCalendar", () => {
  const day = {
    start: "2026-09-28T00:00:00.000Z",
    end: "2026-09-29T00:00:00.000Z",
  };
  const slot = { start: "2026-09-28T07:00:00.000Z", end: "2026-09-28T08:00:00.000Z" };

  it("assigns ids from the injected generator", async () => {
    const booking = await createCalendar().createBlock({
      userId: "user_1",
      taskId: "task_1",
      title: "Подготовить презентацию",
      slot,
    });
    expect(booking).toEqual({
      id: "booking_1",
      taskId: "task_1",
      userId: "user_1",
      slot,
      calendarEventId: "event_1",
    });
  });

  it("includes seeded external busy intervals in getBusyIntervals", async () => {
    const calendar = createCalendar();
    const external = { start: "2026-09-28T06:00:00.000Z", end: "2026-09-28T06:30:00.000Z" };
    calendar.addBusyInterval("user_1", external);
    await calendar.createBlock({ userId: "user_1", taskId: "task_1", title: "Задача", slot });

    await expect(calendar.getBusyIntervals("user_1", day)).resolves.toEqual([external, slot]);
    await expect(calendar.getBusyIntervals("user_2", day)).resolves.toEqual([]);
  });

  it("only conflicts with existing blocks, not with external busy intervals", async () => {
    const calendar = createCalendar();
    calendar.addBusyInterval("user_1", slot);
    await expect(
      calendar.createBlock({ userId: "user_1", taskId: "task_1", title: "Задача", slot }),
    ).resolves.toBeDefined();
  });

  it("validates seeded busy intervals", () => {
    expect(() =>
      createCalendar().addBusyInterval("user_1", { start: slot.end, end: slot.start }),
    ).toThrow(InvalidTimeError);
  });

  it("validates the query range", async () => {
    await expect(
      createCalendar().getBusyIntervals("user_1", { start: slot.end, end: slot.start }),
    ).rejects.toThrow(InvalidTimeError);
  });
});

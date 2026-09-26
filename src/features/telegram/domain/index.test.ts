import { describe, expect, expectTypeOf, it } from "vitest";
import * as domain from "./index";

describe("domain public barrel", () => {
  it("supports the settings-to-time flow through the public API alone", () => {
    const settings = domain.normalizeSettings({
      ...domain.createDefaultSettings("user_1", "ru"),
      timezone: "europe/moscow",
    });
    const midnight = domain.startOfDayInZone("2026-09-25T20:59:00.000Z", settings.timezone);

    expect(midnight).toBe("2026-09-24T21:00:00.000Z");
    expect(domain.addMinutes(midnight, 30)).toBe("2026-09-24T21:30:00.000Z");
    expect(domain.intervalsOverlap(
      { start: midnight, end: domain.addMinutes(midnight, 30) },
      { start: domain.addMinutes(midnight, 15), end: domain.addMinutes(midnight, 45) },
    )).toBe(true);
  });

  it("exposes typed errors and pure helpers", () => {
    expect(() => domain.parseInstant("2026-02-30T00:00:00Z")).toThrow(domain.InvalidTimeError);
    expect(new domain.NotFoundError("x")).toBeInstanceOf(domain.TelegramLayerError);
    expect(domain.followUpForReason("task_too_big")).toBe("split");
    expect(domain.sanitizeDeliveryError("a\nb")).toBe("a b");
    expect(domain.compareByTimeThenId((item: { id: string; at: string }) => item.at)).toBeTypeOf("function");
  });

  it("exposes the port types", () => {
    expectTypeOf<domain.SlotScheduler["propose"]>().returns.toEqualTypeOf<domain.SlotSearchResult>();
    expectTypeOf<domain.CalendarPort["deleteBlock"]>().parameters.toEqualTypeOf<[string, string]>();
    expectTypeOf<domain.TaskRepository["get"]>().parameters.toEqualTypeOf<[string, string]>();
  });
});

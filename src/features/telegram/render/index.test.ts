import { describe, expect, it } from "vitest";
import * as render from "./index";

describe("render barrel", () => {
  it("exports the public API", () => {
    for (const name of [
      "renderMessage",
      "renderRichMarkdown",
      "text",
      "b",
      "timeTag",
      "truncateHtml",
      "assertWithinLimit",
      "visibleLength",
      "escapeHtml",
      "actionButton",
      "keyboard",
      "row",
      "formatSlotRange",
      "slotHtml",
      "formatDuration",
      "formatDeadline",
      "getCatalog",
      "pluralRu",
      "pluralEn",
      "instantToUnixSeconds",
      "formatMoment",
      "weekdayName",
      "utf8Length",
      "RU_TIME_WORDS",
      "HELP_COMMANDS",
      "fill",
      "formatDayLabel",
      "momentHtml",
      "botStartLink",
      "miniAppLink",
      "escapeMarkdown",
      "timeLink",
      "welcomeView",
      "helpView",
      "taskProposalView",
      "forwardChooserView",
      "groupChooserView",
      "groupPointerView",
      "groupSlotsView",
      "reminderView",
      "checkInView",
      "settingsView",
      "noticeForErrorCode",
      "slotListCard",
      "eventCard",
      "reminderCard",
      "paginateAgenda",
      "RenderError",
      "MessageTooLongError",
    ]) {
      expect(render).toHaveProperty(name);
    }
  });

  it("does not expose the unchecked Html brand helper", () => {
    expect(render).not.toHaveProperty("asHtml");
  });
});

import type { RenderedMessage } from "../render/rendered";
import type { ViewContext } from "../render/views/context";
import { checkInView } from "../render/views/checkIn";
import { forwardChooserView } from "../render/views/forwardChooser";
import { groupChooserView } from "../render/views/groupChooser";
import { groupPointerView } from "../render/views/groupPointer";
import { groupSlotsView } from "../render/views/groupSlots";
import { helpView } from "../render/views/help";
import { eventCard, reminderCard, slotListCard } from "../render/views/inlineCards";
import { NOTICE_KINDS, noticeForKind } from "../render/views/notices";
import { paginateAgenda } from "../render/views/agenda";
import { reminderView } from "../render/views/reminder";
import { settingsView } from "../render/views/settings";
import { taskProposalView } from "../render/views/taskProposal";
import { welcomeView } from "../render/views/welcome";
import { CHECK_IN_OUTCOMES } from "../domain";
import { makeSettings } from "./domainFixtures";
import { FRIDAY_SLOT, slotAt, TODAY_SLOT, TOMORROW_SLOT } from "./viewFixtures";

// Fake data only: every view in every state, fed with the same user-controlled
// text, so cross-view invariants (limits, escaping, keyboards) are tested once.

export type ViewSample = {
  readonly name: string;
  readonly render: (ctx: ViewContext) => readonly RenderedMessage[];
};

/** Markup that must never reach a message unescaped. */
export const INJECTION = "<INJECT>&amp;</a>";
/** 200 characters of everything that hurts: markup characters, entities, emoji. */
export const HOSTILE_TITLE = `${INJECTION} 😀 ${"<&>".repeat(60)}`;

const SLOTS = [TODAY_SLOT, TOMORROW_SLOT, FRIDAY_SLOT];

/** Views and states, parameterised by the user-controlled `text` they render. */
export function viewSamples(userText: string): ViewSample[] {
  const task = { id: "task_1", title: userText, deadline: "2026-09-25T15:00:00.000Z", durationMinutes: 125 };
  const source = { sourceText: userText.repeat(5), sourceAuthor: userText, hiddenOrigin: false };
  const one = (name: string, render: (ctx: ViewContext) => RenderedMessage): ViewSample => ({
    name,
    render: (ctx) => [render(ctx)],
  });
  const many = (name: string, render: (ctx: ViewContext) => readonly RenderedMessage[]): ViewSample => ({ name, render });

  return [
    one("welcome", (ctx) => welcomeView({ firstName: userText, calendarConnected: false }, ctx)),
    one("help", (ctx) => helpView(ctx)),
    one("task proposed", (ctx) => taskProposalView({ state: "proposed", task, slots: SLOTS }, ctx)),
    one("task booked", (ctx) => taskProposalView({ state: "booked", task, slot: TODAY_SLOT }, ctx)),
    one("task cancelled", (ctx) => taskProposalView({ state: "cancelled", task }, ctx)),
    one("task no slots (deadline)", (ctx) =>
      taskProposalView({ state: "no_slots", task, search: { exhausted: "none_before_deadline", searchedUntil: task.deadline } }, ctx),
    ),
    one("task no slots (horizon)", (ctx) =>
      taskProposalView({ state: "no_slots", task, search: { exhausted: "horizon_reached", searchedUntil: "2026-09-30T09:00:00.000Z" } }, ctx),
    ),
    one("forward meeting", (ctx) =>
      forwardChooserView(
        { draftId: "d1", kind: "meeting", title: userText, source, alternatives: ["task", "reminder", "info"], proposal: { taskId: "task_1", slots: SLOTS } },
        ctx,
      ),
    ),
    one("forward info", (ctx) =>
      forwardChooserView({ draftId: "d1", kind: "info", title: userText, source, alternatives: ["task", "meeting"] }, ctx),
    ),
    one("group chooser", (ctx) => groupChooserView({ draftId: "d1", title: userText }, ctx)),
    one("group pointer", (ctx) => groupPointerView({ startPayload: "g_abc" }, ctx)),
    one("group slots", (ctx) => groupSlotsView({ task: { id: "task_1", title: userText }, slots: SLOTS, groupTitle: userText }, ctx)),
    one("reminder", (ctx) => reminderView({ task: { id: "task_1", title: userText }, slot: TODAY_SLOT }, ctx)),
    one("check-in question", (ctx) => checkInView({ stage: "question", checkInId: "c1", task: { title: userText } }, ctx)),
    one("check-in reason", (ctx) => checkInView({ stage: "reason", checkInId: "c1", task: { title: userText } }, ctx)),
    ...CHECK_IN_OUTCOMES.map((outcome) =>
      one(`check-in answered ${outcome}`, (ctx) => checkInView({ stage: "answered", outcome, reason: "postponed" }, ctx)),
    ),
    one("settings", (ctx) => settingsView(makeSettings({ timezone: "Europe/Moscow" }), ctx)),
    ...NOTICE_KINDS.map((kind) => one(`notice ${kind}`, (ctx) => noticeForKind(kind, ctx).message)),
    one("inline slots", (ctx) => slotListCard({ slots: SLOTS }, ctx).message),
    one("inline event", (ctx) =>
      eventCard({ title: userText, slot: TOMORROW_SLOT, participants: Array(7).fill(userText) }, ctx).message,
    ),
    one("inline reminder", (ctx) => reminderCard({ title: userText, at: TOMORROW_SLOT.start }, ctx).message),
    many("agenda", (ctx) =>
      paginateAgenda(
        {
          scope: "week",
          blocks: [
            { title: userText, slot: TODAY_SLOT, status: "scheduled" },
            { title: userText, slot: slotAt("2026-09-24T11:00:00.000Z", 30), status: "done" },
          ],
        },
        ctx,
      ),
    ),
  ];
}

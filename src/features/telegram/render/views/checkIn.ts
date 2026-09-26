import { CHECK_IN_OUTCOMES, CHECK_IN_REASONS } from "../../domain";
import type { CheckInOutcome, CheckInReason, Task } from "../../domain";
import { actionButton, disabledButton } from "../buttons";
import { text } from "../html";
import { keyboard, row } from "../keyboard";
import type { RenderedMessage } from "../rendered";
import { renderMessage } from "../renderMessage";
import type { ViewContext } from "./context";
import { chunkRows, quoted, titleHtml } from "./shared";

/**
 * The check-in after a block. Three stages of the same conversation: the
 * outcome question, the reason question (when the block was not completed),
 * and the recorded answer that replaces the buttons.
 */
export type CheckInInput =
  | { readonly stage: "question"; readonly checkInId: string; readonly task: Pick<Task, "title"> }
  | { readonly stage: "reason"; readonly checkInId: string; readonly task: Pick<Task, "title"> }
  | {
      readonly stage: "answered";
      readonly outcome: CheckInOutcome;
      readonly reason: CheckInReason | null;
    };

const OUTCOMES_PER_ROW = 2;

function question(checkInId: string, task: Pick<Task, "title">, ctx: ViewContext): RenderedMessage {
  const { checkIn } = ctx.catalog;
  const buttons = CHECK_IN_OUTCOMES.map((outcome) =>
    actionButton(
      checkIn.outcomes[outcome],
      "checkin.answer",
      { checkInId, outcome },
      outcome === "done" ? "success" : undefined,
    ),
  );
  return renderMessage({
    title: text(checkIn.questionTitle),
    body: quoted(ctx, titleHtml(task.title)),
    keyboard: keyboard(...chunkRows(buttons, OUTCOMES_PER_ROW).map((buttonRow) => row(...buttonRow))),
  });
}

function reason(checkInId: string, task: Pick<Task, "title">, ctx: ViewContext): RenderedMessage {
  const { checkIn } = ctx.catalog;
  // Reasons are sentences: one per row keeps every label readable.
  const rows = CHECK_IN_REASONS.map((value) =>
    row(actionButton(checkIn.reasons[value], "checkin.reason", { checkInId, reason: value })),
  );
  return renderMessage({
    title: text(checkIn.reasonTitle),
    body: quoted(ctx, titleHtml(task.title)),
    keyboard: keyboard(...rows),
  });
}

function answered(outcome: CheckInOutcome, why: CheckInReason | null, ctx: ViewContext): RenderedMessage {
  const { checkIn } = ctx.catalog;
  const facts = [{ label: text(checkIn.outcome), value: text(checkIn.outcomes[outcome]) }];
  if (why !== null) facts.push({ label: text(checkIn.reason), value: text(checkIn.reasons[why]) });
  return renderMessage({
    title: text(checkIn.answeredTitle),
    facts,
    keyboard: keyboard(row(disabledButton(checkIn.recorded))),
  });
}

export function checkInView(input: CheckInInput, ctx: ViewContext): RenderedMessage {
  switch (input.stage) {
    case "question":
      return question(input.checkInId, input.task, ctx);
    case "reason":
      return reason(input.checkInId, input.task, ctx);
    case "answered":
      return answered(input.outcome, input.reason, ctx);
  }
}

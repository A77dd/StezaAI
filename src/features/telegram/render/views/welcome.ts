import { actionButton } from "../buttons";
import { fill, fillPlain } from "../catalog";
import { BLANK_LINE, join, text } from "../html";
import { row } from "../keyboard";
import { createRichDocument } from "../rich";
import type { RenderedMessage, RenderedRichHtmlMessage } from "../rendered";
import { renderMessage } from "../renderMessage";
import type { ViewContext } from "./context";
import { CALENDAR_CONNECT } from "./settingsValues";
import { NAME_MAX_LENGTH, bulletList, compactKeyboard, miniAppButton, tryInlineButton, userLine } from "./shared";

export type WelcomeInput = {
  /** Telegram first name; null when the user has none. */
  readonly firstName: string | null;
  readonly calendarConnected: boolean;
};

/** `/start`: who the bot is, the three ways to start, and quick actions. */
export function welcomeView(input: WelcomeInput, ctx: ViewContext): RenderedMessage {
  const { welcome } = ctx.catalog;
  const title =
    input.firstName === null
      ? text(welcome.greeting)
      : fill(welcome.greetingNamed, { name: userLine(input.firstName, NAME_MAX_LENGTH) });
  const connect = input.calendarConnected
    ? null
    : row(
        actionButton(welcome.connectCalendar, "settings.toggle", { key: "calendar", value: CALENDAR_CONNECT }, "primary"),
      );
  const app = miniAppButton(ctx, ctx.catalog.common.openMiniApp);

  return renderMessage({
    title,
    body: join([text(welcome.intro), BLANK_LINE, bulletList(welcome.ways.map(text))]),
    footer: input.calendarConnected ? undefined : text(welcome.calendarHint),
    keyboard: compactKeyboard([connect, row(tryInlineButton(ctx)), app === null ? null : row(app)]),
  });
}

/**
 * `/start` as a Rich Message (Bot API 10.3): the same greeting, the three
 * ways to start and the calendar hint, plus the same quick-action keyboard
 * attached below the rich body (the presenter binds `reply_markup` for rich
 * cards too).
 */
export function welcomeRichView(input: WelcomeInput, ctx: ViewContext): RenderedRichHtmlMessage {
  const { welcome } = ctx.catalog;
  const doc = createRichDocument();
  doc.heading(
    input.firstName === null
      ? welcome.greeting
      : fillPlain(welcome.greetingNamed, { name: input.firstName.slice(0, NAME_MAX_LENGTH) }),
  );
  doc.line(welcome.intro);
  for (const way of welcome.ways) doc.line(`• ${way}`);
  if (!input.calendarConnected) doc.line(welcome.calendarHint);
  const connect = input.calendarConnected
    ? null
    : row(
        actionButton(welcome.connectCalendar, "settings.toggle", { key: "calendar", value: CALENDAR_CONNECT }, "primary"),
      );
  const app = miniAppButton(ctx, ctx.catalog.common.openMiniApp);
  const built = doc.build();
  return {
    kind: "rich_html",
    html: built.html,
    actions: built.actions,
    keyboard: compactKeyboard([connect, row(tryInlineButton(ctx)), app === null ? null : row(app)]),
  };
}

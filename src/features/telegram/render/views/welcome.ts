import { actionButton } from "../buttons";
import { fill, fillPlain } from "../catalog";
import { BLANK_LINE, join, text } from "../html";
import { row } from "../keyboard";
import { createRichDocument, richEscape, type RichCell } from "../rich";
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
 * `/start` as a Rich Message (Bot API 10.3): carousel placeholder, the
 * greeting with the three ways to start, the legal footer, and the quick
 * actions as buttons INSIDE the message body. The profile button opens the
 * Mini App when one is configured; until then it is a placeholder url button.
 * All interactive state changes re-render this same message (press →
 * re-render → answer), the pattern the rich-buttons ecosystem is built on.
 */
export function welcomeRichView(input: WelcomeInput, ctx: ViewContext): RenderedRichHtmlMessage {
  return welcomeRichState(input, ctx, null);
}

/** The provider-choice state: same card, the calendar providers as buttons. */
export function welcomeProvidersRichView(input: WelcomeInput, ctx: ViewContext): RenderedRichHtmlMessage {
  return welcomeRichState(input, ctx, "providers");
}

function welcomeRichState(
  input: WelcomeInput,
  ctx: ViewContext,
  state: "providers" | null,
): RenderedRichHtmlMessage {
  const { welcome } = ctx.catalog;
  const doc = createRichDocument();

  // Carousel placeholder: `<tg-slideshow>` takes `<img src>` children in the
  // Rich HTML representation (the markdown `![]()` form belongs to the
  // markdown representation only). Real artwork lands with the Mini App.
  doc.slideshow([
    "https://placehold.co/600x340/3390ec/ffffff.png?text=Steza+1",
    "https://placehold.co/600x340/4fae4e/ffffff.png?text=Steza+2",
    "https://placehold.co/600x340/707579/ffffff.png?text=Steza+3",
  ]);

  doc.heading(
    input.firstName === null
      ? welcome.greeting
      : fillPlain(welcome.greetingNamed, { name: input.firstName.slice(0, NAME_MAX_LENGTH) }),
  );
  doc.line(welcome.intro);
  doc.list(welcome.ways);

  if (state === "providers") {
    doc.line(welcome.providersTitle);
    for (const provider of welcome.providers) {
      doc.buttonRow([providerCell(provider.label, "welcome.connect", { provider: provider.id }, "success")]);
    }
    doc.buttonRow([providerCell(welcome.back, "welcome.providers.back", {}, undefined)]);
  } else if (input.calendarConnected) {
    doc.line(welcome.calendarConnectedNote);
    doc.buttonRow([urlCellForProfile(ctx)]);
  } else {
    doc.buttonRow([providerCell(welcome.connectCalendar, "welcome.providers", {}, "primary")]);
    doc.buttonRow([urlCellForProfile(ctx)]);
  }

  // Legal footer: small gray text with underlined links (rendered by the
  // client); both documents are placeholders pointing to t.me for now.
  const legalUrl = `https://t.me/${ctx.botUsername}`;
  doc.raw(
    `<footer>${richEscape(welcome.legal)
      .replace("{doc1}", `<a href="${legalUrl}">${richEscape(welcome.legalDoc1)}</a>`)
      .replace("{doc2}", `<a href="${legalUrl}">${richEscape(welcome.legalDoc2)}</a>`)}</footer>`,
  );

  const built = doc.build();
  return { kind: "rich_html", html: built.html, actions: built.actions, keyboard: null };
}

function providerCell(
  label: string,
  action: "welcome.providers" | "welcome.providers.back" | "welcome.connect" | "welcome.profile",
  payload: Record<string, unknown>,
  style?: "primary" | "success" | "danger",
): RichCell {
  return {
    kind: "action",
    button: actionButton(label, action as never, payload as never, style) as never,
  } as RichCell;
}

function urlCellForProfile(ctx: ViewContext): RichCell {
  // The Mini App is not built yet (Task F): the profile button is a
  // placeholder url button until `ctx.miniAppUrl` exists.
  return { kind: "url", label: ctx.catalog.welcome.profileButton, url: `https://t.me/${ctx.botUsername}` };
}



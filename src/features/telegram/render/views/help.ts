import { b, BLANK_LINE, join, lines, text } from "../html";
import { fill } from "../catalog";
import { row } from "../keyboard";
import type { RenderedMessage } from "../rendered";
import { renderMessage } from "../renderMessage";
import type { ViewContext } from "./context";
import { bulletList, compactKeyboard, miniAppButton, tryInlineButton } from "./shared";

/** `/help`: what the bot does, how to reach it inline, and the commands. */
export function helpView(ctx: ViewContext): RenderedMessage {
  const { help } = ctx.catalog;
  const hint = fill(help.inlineHint, { bot: text(`@${ctx.botUsername}`) });
  const commands = lines(b(text(help.commandsTitle)), ...help.commands.map(text));
  const app = miniAppButton(ctx, ctx.catalog.common.openMiniApp);

  return renderMessage({
    title: text(help.title),
    body: join([bulletList(help.items.map(text)), hint, commands], BLANK_LINE),
    footer: text(help.footer),
    keyboard: compactKeyboard([row(tryInlineButton(ctx)), app === null ? null : row(app)]),
  });
}

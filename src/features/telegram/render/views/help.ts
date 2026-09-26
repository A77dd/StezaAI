import { HELP_COMMANDS, fill } from "../catalog";
import type { HelpCommand } from "../catalog";
import { RenderError } from "../errors";
import { b, BLANK_LINE, join, lines, text } from "../html";
import type { Html } from "../htmlType";
import { row } from "../keyboard";
import type { RenderedMessage } from "../rendered";
import { renderMessage } from "../renderMessage";
import type { ViewContext } from "./context";
import { bulletList, compactKeyboard, miniAppButton, tryInlineButton } from "./shared";

export type HelpInput = {
  /**
   * Commands the bot really handles right now, from the caller (the command
   * registry). Help lists only these, so it never advertises a command that
   * is not implemented; they appear in a fixed order.
   */
  readonly availableCommands: readonly HelpCommand[];
};

function commandsBlock(available: readonly HelpCommand[], ctx: ViewContext): Html | null {
  for (const command of available) {
    if (!HELP_COMMANDS.includes(command)) throw new RenderError("Help does not know this command");
  }
  const listed = HELP_COMMANDS.filter((command) => available.includes(command));
  if (listed.length === 0) return null;
  const { help } = ctx.catalog;
  const items = listed.map((command) =>
    fill(help.commandLine, { command: text(command), description: text(help.commandDescriptions[command]) }),
  );
  return lines(b(text(help.commandsTitle)), ...items);
}

/** `/help`: what the bot does, how to reach it inline, and the available commands. */
export function helpView(input: HelpInput, ctx: ViewContext): RenderedMessage {
  const { help } = ctx.catalog;
  const hint = fill(help.inlineHint, { bot: text(`@${ctx.botUsername}`) });
  const commands = commandsBlock(input.availableCommands, ctx);
  const app = miniAppButton(ctx, ctx.catalog.common.openMiniApp);

  return renderMessage({
    title: text(help.title),
    body: join([bulletList(help.items.map(text)), hint, ...(commands === null ? [] : [commands])], BLANK_LINE),
    footer: text(help.footer),
    keyboard: compactKeyboard([row(tryInlineButton(ctx)), app === null ? null : row(app)]),
  });
}

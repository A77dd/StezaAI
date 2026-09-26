import { TelegramLayerError } from "../domain";

/**
 * Render errors. Messages describe the broken rule and never echo the text
 * being rendered (it is user content), so they are safe to log.
 */

/** A view, button or HTML fragment breaks a Telegram formatting or size rule. */
export class RenderError extends TelegramLayerError {
  constructor(message: string, options?: ErrorOptions) {
    super("render_invalid", message, options);
  }
}

/**
 * Rendered text is longer than Telegram accepts. Nothing is ever cut silently:
 * a view either fits or its author opts into `truncateHtml`.
 */
export class MessageTooLongError extends TelegramLayerError {
  readonly limit: number;
  readonly actual: number;

  constructor(limit: number, actual: number, options?: ErrorOptions) {
    super(
      "render_too_long",
      `Message is ${actual} characters long; the limit is ${limit}`,
      options,
    );
    this.limit = limit;
    this.actual = actual;
  }
}

import type { ActionButtonSpec } from "./buttonSpec";
import { RenderError } from "./errors";
import { BUTTON_TEXT_LIMIT } from "./limits";

/**
 * Builder for Rich HTML documents with buttons INSIDE the message body
 * (Bot API 10.3, research §5.2; the interactive-UI pattern from the field:
 * chess boards, poker tables). Rules encoded here:
 * - a button row carries 1-8 `<tg-button>` elements;
 * - `callback_data` is 1-64 bytes — our codec already guarantees that, so
 *   action buttons are emitted as `{{cb:N}}` placeholders and the presenter
 *   substitutes bound data; URL and disabled buttons carry no secrets and go
 *   out verbatim;
 * - labels are 1-64 visible characters and escaped, so caller text can never
 *   inject markup;
 * - blocks are separated by single newlines; the document is plain data the
 *   presenter sends as `sendRichMessage(chatId, { html })`.
 */

export type RichHtmlDoc = {
  readonly html: string;
  /** One `ActionButtonSpec` per `{{cb:N}}` placeholder, in order. */
  readonly actions: readonly ActionButtonSpec[];
};

const RICH_BUTTON_LIMIT = 8;

export function richEscape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export type RichCell =
  | { readonly kind: "action"; readonly button: ActionButtonSpec }
  | { readonly kind: "url"; readonly label: string; readonly url: string }
  | { readonly kind: "disabled"; readonly label: string };

export function urlCell(label: string, url: string): RichCell {
  if (!URL.canParse(url) || new URL(url).protocol !== "https:") {
    throw new RenderError("A rich url button must be an absolute https URL");
  }
  return { kind: "url", label, url };
}

export function disabledCell(label: string): RichCell {
  return { kind: "disabled", label };
}

export type RichDocument = {
  /** Appends a ready-made Rich HTML fragment (already escaped by the caller). */
  raw(html: string): void;
  /** `<b>` heading block. */
  heading(text: string): void;
  /** Plain text block. */
  line(text: string): void;
  /** One row of 1-8 buttons; action cells become placeholders in `build()`. */
  buttonRow(cells: readonly RichCell[]): void;
  build(): RichHtmlDoc;
};

export function createRichDocument(): RichDocument {
  const blocks: string[] = [];
  const actions: ActionButtonSpec[] = [];

  const assertRowSize = (count: number): void => {
    if (count < 1 || count > RICH_BUTTON_LIMIT) {
      throw new RenderError(`A rich button row carries 1-${RICH_BUTTON_LIMIT} buttons, got ${count}`);
    }
  };

  const disabled = (label: string): string => {
    if (label.length === 0 || label.length > BUTTON_TEXT_LIMIT) {
      throw new RenderError(`Button text must be 1-${BUTTON_TEXT_LIMIT} visible characters`);
    }
    return `<tg-button type="disabled">${richEscape(label)}</tg-button>`;
  };

  return {
    raw(html) {
      blocks.push(html);
    },
    heading(text) {
      blocks.push(`<b>${richEscape(text)}</b>`);
    },
    line(text) {
      blocks.push(richEscape(text));
    },
    buttonRow(cells) {
      assertRowSize(cells.length);
      const rendered = cells.map((cell) => {
        if (cell.kind === "disabled") return disabled(cell.label);
        if (cell.kind === "url") {
          return `<tg-button type="url" url="${richEscape(cell.url)}">${richEscape(cell.label)}</tg-button>`;
        }
        const index = actions.length;
        actions.push(cell.button);
        const style = cell.button.style === undefined ? "" : ` style="${cell.button.style}"`;
        return `<tg-button type="callback_data"${style} data="{{cb:${index}}}">${richEscape(cell.button.text)}</tg-button>`;
      });
      blocks.push(`<tg-button-row>${rendered.join("")}</tg-button-row>`);
    },
    build() {
      if (blocks.length === 0) throw new RenderError("A rich document needs at least one block");
      return { html: blocks.join("\n"), actions: [...actions] };
    },
  };
}

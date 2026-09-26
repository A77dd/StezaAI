import { RenderError } from "../errors";
import { join, text } from "../html";
import type { Html } from "../htmlType";

/**
 * Catalog strings with parameters are templates with `{name}` placeholders.
 * Filling is strict in both directions (a placeholder without a value and a
 * value without a placeholder both fail), so a catalog edit or a view edit
 * that drifts apart fails in tests instead of shipping "{title}" to users.
 * Errors name the placeholder, never the value (values are user text).
 */

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

/** Placeholder names of a template, once each, in order of appearance. */
export function placeholders(template: string): string[] {
  return [...new Set(Array.from(template.matchAll(PLACEHOLDER), (match) => match[1]))];
}

function assertShapes(template: string, given: readonly string[]): void {
  const expected = placeholders(template);
  const missing = expected.filter((name) => !given.includes(name));
  if (missing.length > 0) {
    throw new RenderError(`Template placeholder has no value: ${missing.join(", ")}`);
  }
  const unused = given.filter((name) => !expected.includes(name));
  if (unused.length > 0) {
    throw new RenderError(`Template value is unused: ${unused.join(", ")}`);
  }
}

/** Template literals are escaped; values are prepared `Html` and inserted as they are. */
export function fill(template: string, values: Readonly<Record<string, Html>>): Html {
  assertShapes(template, Object.keys(values));
  const parts: Html[] = [];
  let last = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    parts.push(text(template.slice(last, match.index)));
    parts.push(values[match[1]]);
    last = match.index + match[0].length;
  }
  parts.push(text(template.slice(last)));
  return join(parts);
}

/** For places that are not HTML (button labels, copy text, notices): plain strings in, plain string out. */
export function fillPlain(template: string, values: Readonly<Record<string, string>>): string {
  assertShapes(template, Object.keys(values));
  return template.replace(PLACEHOLDER, (_whole, name: string) => values[name]);
}

import { badRequest } from "./rejection";

/** A decoded request body: what grammY hands to the transformer. */
export type Payload = Readonly<Record<string, unknown>>;

export function isRecord(value: unknown): value is Payload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireRecord(value: unknown, field: string): Payload {
  if (!isRecord(value)) throw badRequest(`${field} must be an object`);
  return value;
}

export function optionalString(payload: Payload, key: string): string | undefined {
  const value = payload[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw badRequest(`${key} must be a string`);
  return value;
}

/** `missing` is the description detail for an absent value, in the wording of the real API. */
export function requireString(payload: Payload, key: string, missing: string): string {
  const value = optionalString(payload, key);
  if (value === undefined || value === "") throw badRequest(missing);
  return value;
}

export function optionalBoolean(payload: Payload, key: string): boolean | undefined {
  const value = payload[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw badRequest(`${key} must be a boolean`);
  return value;
}

export function optionalInteger(
  payload: Payload,
  key: string,
  minimum: number,
): number | undefined {
  const value = payload[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw badRequest(`${key} must be an integer of at least ${minimum}`);
  }
  return value;
}

export function requireInteger(
  payload: Payload,
  key: string,
  minimum: number,
  missing: string,
): number {
  const value = optionalInteger(payload, key, minimum);
  if (value === undefined) throw badRequest(missing);
  return value;
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Characters as a person counts them (code points), for limits documented as "characters". */
export function characterCount(text: string): number {
  return [...text].length;
}

/** Throws unless `payload` has none of `keys`; for features the fake does not model. */
export function rejectUnmodelled(payload: Payload, keys: readonly string[]): void {
  for (const key of keys) {
    if (payload[key] !== undefined) {
      throw badRequest(`the fake Bot API does not model ${key}`);
    }
  }
}

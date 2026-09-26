import type { ResponseParameters } from "grammy/types";

/**
 * An error the real Bot API would answer with `{ ok: false, ... }`. Validation
 * throws it; the fake turns it into an API response, so grammY raises a real
 * `GrammyError` in the code under test.
 *
 * UNVERIFIED: the Bot API reference lists no error texts. The descriptions
 * used across the fake follow what the real API is known to answer
 * ("Bad Request: message is not modified: ...", "BUTTON_DATA_INVALID", ...);
 * tests should assert on `error_code` and a stable prefix, never on the tail
 * of a description.
 */
export class ApiRejection extends Error {
  readonly errorCode: number;
  readonly description: string;
  readonly parameters: ResponseParameters | undefined;

  constructor(errorCode: number, description: string, parameters?: ResponseParameters) {
    super(description);
    this.name = "ApiRejection";
    this.errorCode = errorCode;
    this.description = description;
    this.parameters = parameters;
  }
}

/** `400 Bad Request: <detail>`. */
export function badRequest(detail: string): ApiRejection {
  return new ApiRejection(400, `Bad Request: ${detail}`);
}

/** `403 Forbidden: <detail>`. */
export function forbidden(detail: string): ApiRejection {
  return new ApiRejection(403, `Forbidden: ${detail}`);
}

/** `429 Too Many Requests: retry after N` with `parameters.retry_after`. */
export function tooManyRequests(retryAfterSeconds: number): ApiRejection {
  return new ApiRejection(429, `Too Many Requests: retry after ${retryAfterSeconds}`, {
    retry_after: retryAfterSeconds,
  });
}

/** What answering an unknown, expired or already answered query returns. */
export const QUERY_TOO_OLD =
  "query is too old and response timeout expired or query ID is invalid";

/** The full description of the 400 for an edit that changes nothing. */
export const NOT_MODIFIED_DESCRIPTION =
  "Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message";

export function messageNotModified(): ApiRejection {
  return new ApiRejection(400, NOT_MODIFIED_DESCRIPTION);
}

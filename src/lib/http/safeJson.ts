/**
 * Parse a fetch Response body as JSON without throwing when the server (or
 * an infrastructure layer in front of it, e.g. a platform request-size
 * limit) returns a non-JSON body such as a plain-text "413 Request Entity
 * Too Large" error.
 *
 * Calling `res.json()` directly on a non-JSON body throws a raw
 * `SyntaxError` (e.g. `Unexpected token 'R', "Request En"... is not valid
 * JSON`) which then gets surfaced verbatim to the user. This helper instead
 * returns `{ error: <readable message> }` so callers can show something
 * sensible.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const trimmed = text.trim();
    const preview = trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
    return { error: preview || `Request failed with status ${res.status}` };
  }
}

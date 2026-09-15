/**
 * Shared query-parameter primitives for secondary API validation.
 *
 * Plain functions (no framework dependency): every route validates raw
 * `URLSearchParams` here before any repository call. Rejected input yields
 * a VALIDATION_ERROR response with per-field details.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAX_SEARCH_LENGTH = 200;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Reads the first present, non-blank value across accepted parameter name
 * aliases (e.g. `projectId` and legacy `project_id`). Returns null when
 * the parameter was not supplied.
 */
export function getQueryParam(
  searchParams: URLSearchParams,
  ...names: string[]
): string | null {
  for (const name of names) {
    const raw = searchParams.get(name);
    if (raw !== null && raw.trim() !== "") {
      return raw.trim();
    }
  }
  return null;
}

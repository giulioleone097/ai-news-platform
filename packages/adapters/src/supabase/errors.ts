/** Raises the error of a Supabase response as an `Error` that says what was being done, then why. */
export function throwIfError(error: { message: string } | null, context: string): asserts error is null {
  if (error) throw new Error(`${context}: ${error.message}`);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether `value` can be the id of a row. PostgREST rejects any other text compared with a `uuid` column with an
 * error, where the caller asked a plain question whose answer is "there is no such row".
 */
export function isUuid(value: string) {
  return uuidPattern.test(value);
}

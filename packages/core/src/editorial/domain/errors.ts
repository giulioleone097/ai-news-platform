/** A rule the caller can fix. The message is written for the caller and safe to show. */
export class EditorialRuleError extends Error {
  override readonly name: string = "EditorialRuleError";
}

/** One rejected item of a batch, by its position in the request (0-based). */
export interface BatchIssue {
  index: number;
  /** The slug, key or id the caller used for the item, when it has one. */
  label?: string;
  message: string;
}

/** Most items one batch may carry for articles, categories and entities. The SQL batch functions mirror it. */
export const batchLimit = 25;
/** Media payloads are base64 images of up to 160 KiB each, so a media batch is smaller. */
export const mediaBatchLimit = 10;

export function formatBatchIssues(issues: readonly BatchIssue[]) {
  const lines = issues.map(({ index, label, message }) => `#${index}${label ? ` (${label})` : ""}: ${message}`);
  return `Nothing was written. ${issues.length === 1 ? "1 item is" : `${issues.length} items are`} invalid. ${lines.join(" | ")}`;
}

/** Every invalid item of a batch, reported together; raised before anything is written. */
export class BatchValidationError extends EditorialRuleError {
  override readonly name = "BatchValidationError";
  constructor(readonly issues: readonly BatchIssue[]) {
    super(formatBatchIssues(issues));
  }
}

export function assertBatchSize(count: number, limit: number, noun: string) {
  if (count < 1) throw new EditorialRuleError(`A batch needs at least one ${noun}.`);
  if (count > limit) throw new EditorialRuleError(`A batch takes at most ${limit} ${noun}s; got ${count}. Split it.`);
}

/**
 * Runs `check` on every item and reports every item that breaks a rule, by index. Anything that is
 * not an `EditorialRuleError` (a database outage, a bug) is not an invalid item and is rethrown.
 */
export async function validateEach<T, R>(
  items: readonly T[],
  check: (item: T, index: number) => R | Promise<R>,
  label: (item: T) => string | undefined = () => undefined,
  /** Issues found across items beforehand (see `findRepeats`); they are reported with the rest. */
  known: readonly BatchIssue[] = [],
): Promise<R[]> {
  const settled = await Promise.allSettled(items.map(async (item, index) => check(item, index)));
  const issues: BatchIssue[] = [...known];
  const values: R[] = [];
  settled.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") {
      values.push(outcome.value);
    } else if (outcome.reason instanceof EditorialRuleError) {
      issues.push({ index, label: label(items[index]), message: outcome.reason.message });
    } else {
      throw outcome.reason;
    }
  });
  if (issues.length) throw new BatchValidationError(issues.sort((left, right) => left.index - right.index));
  return values;
}

/** Finds a value that repeats inside one batch; each repeat is an issue on the later item. */
export function findRepeats<T>(
  items: readonly T[],
  key: (item: T) => string | undefined,
  describe: (key: string) => string,
): BatchIssue[] {
  const first = new Map<string, number>();
  const issues: BatchIssue[] = [];
  items.forEach((item, index) => {
    const value = key(item);
    if (value === undefined) return;
    const earlier = first.get(value);
    if (earlier === undefined) first.set(value, index);
    else issues.push({ index, label: value, message: `${describe(value)} (also item #${earlier})` });
  });
  return issues;
}

/** Like `findRepeats`, but throws at once; for batches whose items need no other check. */
export function rejectRepeats<T>(
  items: readonly T[],
  key: (item: T) => string | undefined,
  describe: (key: string) => string,
) {
  const issues = findRepeats(items, key, describe);
  if (issues.length) throw new BatchValidationError(issues);
}

/** A single-item call runs the batch path; its one invalid item should read as a plain error. */
export async function asSingle<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof BatchValidationError && error.issues.length === 1) {
      throw new EditorialRuleError(error.issues[0].message);
    }
    throw error;
  }
}

import type { Annotations } from "./capability";

/** Reads data and changes nothing. */
export const readOnly: Annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** Changes editorial state that can be changed back. */
export const write: Annotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

/** Removes data for good. */
export const destructive: Annotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

/** Queues work that other workers deliver; repeating the call does not repeat the work. */
export const enqueue: Annotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/** Reaches people or networks outside the newsroom. */
export const externalWrite: Annotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

/** Page state only: changes what the reader sees, not stored data. */
export const pageState: Annotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

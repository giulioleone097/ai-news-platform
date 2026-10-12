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

/** Sends one message to an address the caller names (an invitation, a double-opt-in request); the person can ignore it. */
export const externalWrite: Annotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

/**
 * Cannot be taken back: a campaign sent to its audience, a cancellation, a replaced queued payload, erased
 * personal data. Repeating the call changes nothing more. Publishing and unpublishing are reversible and stay `write`.
 */
export const irreversible: Annotations = { ...enqueue, destructiveHint: true };

/** Delivers queued mail or posts to people and networks outside the newsroom; each call sends more, and a delivery cannot be recalled. */
export const dispatch: Annotations = { ...externalWrite, destructiveHint: true };

/** Page state only: changes what the reader sees, not stored data. */
export const pageState: Annotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

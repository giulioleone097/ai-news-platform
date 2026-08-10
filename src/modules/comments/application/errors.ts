export type CommentErrorCode =
  | "configuration_unavailable"
  | "invalid_request"
  | "invalid_cursor"
  | "not_found"
  | "operation_not_allowed"
  | "rate_limited"
  | "already_reported"
  | "notification_token_invalid"
  | "storage_error";

export class CommentOperationError extends Error {
  constructor(
    readonly code: CommentErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CommentOperationError";
  }
}

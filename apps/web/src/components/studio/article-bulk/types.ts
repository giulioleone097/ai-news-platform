export type BulkAction = "publish" | "unpublish" | "delete";

export type BulkActionResult =
  | { status: "success"; message: string }
  | { status: "error"; message: string };

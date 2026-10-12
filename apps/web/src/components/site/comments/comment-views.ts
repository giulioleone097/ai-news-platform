import type { CreatedComment, OwnComment, PublicComment } from "@atlasnews/core/comments/domain/comment";

/** A comment the reader may still manage: the one they just sent, or one the server lists as theirs. */
export type ManagedComment = CreatedComment | OwnComment;

export function mergeOwnedComments(
  stored: OwnComment[],
  overrides: CreatedComment[],
  deletedIds: ReadonlySet<string>,
): ManagedComment[] {
  const merged = new Map<string, ManagedComment>();
  for (const comment of stored) {
    if (!deletedIds.has(comment.id)) merged.set(comment.id, comment);
  }
  for (const comment of overrides) {
    if (!deletedIds.has(comment.id)) merged.set(comment.id, comment);
  }
  return [...merged.values()].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export function mergeCommentViews(
  published: PublicComment[],
  owned: ManagedComment[],
  hiddenIds: ReadonlySet<string>,
) {
  const ownershipById = new Map(owned.map((comment) => [comment.id, comment]));
  const matchedOwnership = new Set<string>();
  const publicEntries = published.flatMap((comment) => {
    if (hiddenIds.has(comment.id)) return [];
    const ownership = ownershipById.get(comment.id) ?? null;
    if (ownership && ownership.status !== "approved") return [];
    if (ownership) matchedOwnership.add(ownership.id);
    return [{ comment, ownership }];
  });
  return {
    publicEntries,
    standaloneOwned: owned.filter(
      (comment) => !hiddenIds.has(comment.id) && !matchedOwnership.has(comment.id),
    ),
  };
}

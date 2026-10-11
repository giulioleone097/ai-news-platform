import type { ClaimStatus } from "@atlasnews/core/editorial/domain/article";

/** How many of the four bars a status fills. Analysis is not a claim, so it has no meter. */
const levels: Record<ClaimStatus, number> = { rumour: 1, test: 2, rollout: 3, confirmed: 4, analysis: 0 };

/** The status word is always printed: the meter only reinforces it. */
export function ClaimChip({ status, label }: { status: ClaimStatus; label: string }) {
  const level = levels[status];
  return (
    <span className="status" data-level={level}>
      {level ? (
        <span className="status__meter" aria-hidden="true"><i /><i /><i /><i /></span>
      ) : null}
      {label}
    </span>
  );
}

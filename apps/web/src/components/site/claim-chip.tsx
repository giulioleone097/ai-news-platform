import type { ClaimStatus } from "@atlasnews/core/editorial/domain/article";

/** How many of the four bars a status fills. Analysis is not a claim, so it has no bars. */
const levels: Record<ClaimStatus, number> = { rumour: 1, test: 2, rollout: 3, confirmed: 4, analysis: 0 };

/** The picture of a status: bars that fill as a claim firms up, or lines of text for an analysis. It scales with the font size. */
export function StatusGlyph({ status }: { status: ClaimStatus }) {
  const level = levels[status];
  return level ? (
    <span className="status__meter" data-level={level} aria-hidden="true"><i /><i /><i /><i /></span>
  ) : (
    <span className="status__lines" aria-hidden="true"><i /><i /><i /></span>
  );
}

/** The status word is always printed: the glyph only reinforces it. `size` picks the tier: rows keep the default. */
export function ClaimChip({
  status,
  label,
  size = "row",
}: {
  status: ClaimStatus;
  label: string;
  size?: "row" | "card" | "lead";
}) {
  return (
    <span className={size === "row" ? "status" : `status status--${size}`}>
      <StatusGlyph status={status} />
      {label}
    </span>
  );
}

import type { ClaimStatus } from "@atlasnews/core/editorial/domain/article";

/** The status word is always printed: the colour only reinforces it. */
export function ClaimChip({ status, label }: { status: ClaimStatus; label: string }) {
  return <span className={`claim-chip claim-chip--${status}`}>{label}</span>;
}

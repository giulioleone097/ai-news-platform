import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Messages } from "@/i18n";

/** "Showing 1–25 of 40" with Previous and Next; the page decides where each link goes. */
export function Pagination({
  copy,
  from,
  to,
  total,
  previousHref,
  nextHref,
}: {
  copy: Messages["studio"]["pagination"];
  from: number;
  to: number;
  total: number;
  previousHref?: string;
  nextHref?: string;
}) {
  if (!previousHref && !nextHref) return null;
  return (
    <nav aria-label={copy.label} className="studio-pagination">
      <p>{copy.showing.replace("{from}", String(from)).replace("{to}", String(to)).replace("{total}", String(total))}</p>
      <div>
        {previousHref ? (
          <Link className="button button--small button--quiet" href={previousHref}>
            <ArrowLeft aria-hidden="true" /> {copy.previous}
          </Link>
        ) : null}
        {nextHref ? (
          <Link className="button button--small button--quiet" href={nextHref}>
            {copy.next} <ArrowRight aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

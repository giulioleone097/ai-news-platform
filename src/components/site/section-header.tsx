import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function SectionHeader({
  title,
  href,
  linkLabel,
  accent = false,
  id,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  accent?: boolean;
  id?: string;
}) {
  return (
    <div className={`section-header${accent ? " section-header--accent" : ""}`}>
      <h2 id={id}>{title}</h2>
      {href && linkLabel ? (
        <Link href={href}>
          {linkLabel}<ArrowRight aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

/** The head every Studio view starts with: title, an optional one-line description, and the view's actions. */
export function PageHead({
  title,
  description,
  scope,
  back,
  badge,
  children,
}: {
  title: string;
  description?: string;
  /** For a list that is per language: "English articles". */
  scope?: string;
  back?: { href: string; label: string };
  badge?: ReactNode;
  /** The view's actions, on the right. One primary button at most. */
  children?: ReactNode;
}) {
  return (
    <header className="studio-head">
      <div>
        {back ? (
          <Link className="studio-back" href={back.href}>
            <ChevronLeft aria-hidden="true" size={16} />
            {back.label}
          </Link>
        ) : null}
        <h1>
          {title}
          {badge}
        </h1>
        {description ? <p>{description}</p> : null}
        {scope ? <p className="studio-head__scope">{scope}</p> : null}
      </div>
      {children ? <div className="studio-head__actions">{children}</div> : null}
    </header>
  );
}

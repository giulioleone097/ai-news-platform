import Link from "next/link";

export function SectionHeader({
  title,
  href,
  linkLabel,
  id,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  id?: string;
}) {
  return (
    <div className="section-header">
      <h2 id={id}>{title}</h2>
      {href && linkLabel ? (
        <Link href={href} prefetch={false}>{linkLabel}</Link>
      ) : null}
    </div>
  );
}

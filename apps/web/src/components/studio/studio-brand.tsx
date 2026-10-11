import Link from "next/link";
import { BrandMark } from "@/components/site/brand-mark";
import "./brand.css";

/** The wordmark with the "Studio" label, linking to `href`. */
export function StudioBrand({ href, name, label }: { href: string; name: string; label: string }) {
  return (
    <Link className="brand" href={href}>
      <BrandMark name={name} />
      <span className="brand__label">{label}</span>
    </Link>
  );
}

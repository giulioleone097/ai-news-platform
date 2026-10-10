"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  FileText,
  Gauge,
  Images,
  Mail,
  MessageSquareText,
  Send,
  Tags,
  type LucideIcon,
} from "lucide-react";
import type { Locale, Messages } from "@/i18n";
import { studioSupplementalCopy } from "./studio-copy";

interface NavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export function StudioNavigation({
  locale,
  copy,
}: {
  locale: Locale;
  copy: Messages["studio"];
}) {
  const pathname = usePathname();
  const root = `/${locale}/studio`;
  const { navEntities, navCategories } = studioSupplementalCopy[locale];
  const items: NavigationItem[] = [
    { href: root, label: copy.dashboard, icon: Gauge, exact: true },
    { href: `${root}/articles`, label: copy.articles, icon: FileText },
    { href: `${root}/entities`, label: navEntities, icon: Building2 },
    { href: `${root}/categories`, label: navCategories, icon: Tags },
    { href: `${root}/media`, label: copy.media, icon: Images },
    { href: `${root}/distribution`, label: copy.distribution, icon: Send },
    { href: `${root}/newsletter`, label: copy.newsletter, icon: Mail },
    { href: `${root}/comments`, label: copy.comments, icon: MessageSquareText },
  ];

  return (
    <nav className="studio-nav" aria-label={copy.navigationLabel}>
      {items.map(({ href, label, icon: Icon, exact }) => {
        const isCurrent = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link aria-current={isCurrent ? "page" : undefined} href={href} key={href}>
            <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

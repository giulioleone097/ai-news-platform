"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  FileText,
  Gauge,
  Images,
  Inbox,
  Mail,
  MessageSquareText,
  Send,
  Tags,
  Users,
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
  isAdmin,
}: {
  locale: Locale;
  copy: Messages["studio"];
  /** Only admins manage the team; the page answers 404 to everybody else. */
  isAdmin: boolean;
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
    { href: `${root}/inbox`, label: copy.inbox, icon: Inbox },
    ...(isAdmin ? [{ href: `${root}/team`, label: copy.team, icon: Users }] : []),
  ];

  return (
    <nav className="studio-nav" aria-label={copy.navigationLabel}>
      {items.map(({ href, label, icon: Icon, exact }) => {
        const isCurrent = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link aria-current={isCurrent ? "page" : undefined} href={href} key={href}>
            <Icon aria-hidden="true" size={18} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

/**
 * The left column on a desktop; on a phone or tablet a top bar whose menu button opens the same links.
 * The menu is open for the page it was opened on, so following a link closes it without an effect.
 */
export function StudioSidebar({
  brand,
  label,
  children,
}: {
  brand: ReactNode;
  /** Names the menu button. */
  label: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const bodyId = useId();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;

  return (
    <aside
      className="studio-sidebar"
      data-open={open}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) setOpenAt(null);
      }}
    >
      <div className="studio-sidebar__head">
        {brand}
        <button
          aria-controls={bodyId}
          aria-expanded={open}
          aria-label={label}
          className="studio-icon-button studio-menu-button"
          onClick={() => setOpenAt(open ? null : pathname)}
          type="button"
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
      <div className="studio-sidebar__body" id={bodyId}>
        {children}
      </div>
    </aside>
  );
}

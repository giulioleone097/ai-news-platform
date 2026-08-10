"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n";
import styles from "./lazy-comments-widget.module.css";

const DeferredCommentsWidget = dynamic(
  () => import("./comments-widget").then((module) => module.CommentsWidget),
  { ssr: false },
);

export function LazyCommentsWidget({
  articleId,
  locale,
}: {
  articleId: string;
  locale: Locale;
}) {
  const boundaryRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const boundary = boundaryRef.current;
    if (!boundary || active) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = setTimeout(() => setActive(true), 0);
      return () => clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setActive(true);
        observer.disconnect();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(boundary);
    return () => observer.disconnect();
  }, [active]);

  return (
    <div className={styles.boundary} id="comments" ref={boundaryRef}>
      {active ? <DeferredCommentsWidget articleId={articleId} locale={locale} /> : null}
    </div>
  );
}

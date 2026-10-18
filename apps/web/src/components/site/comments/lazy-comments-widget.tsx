"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n";
import styles from "./lazy-comments-widget.module.css";

// Only rendered after the reader scrolls near it, so it is never part of the server render and
// plain React.lazy gives the same split without next/dynamic's loadable shim.
const DeferredCommentsWidget = lazy(() =>
  import("./comments-widget").then((module) => ({ default: module.CommentsWidget })),
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
      {active ? (
        <Suspense fallback={null}>
          <DeferredCommentsWidget articleId={articleId} locale={locale} />
        </Suspense>
      ) : null}
    </div>
  );
}

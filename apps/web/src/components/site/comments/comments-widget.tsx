"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CommentLocale } from "@atlasnews/core/comments/domain/comment";
import { commentCopy } from "./comment-copy";
import { CommentList } from "./comment-list";
import styles from "./comments.module.css";

function useNearViewport<T extends HTMLElement>(rootMargin = "600px 0px") {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || near) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = setTimeout(() => setNear(true), 0);
      return () => clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0.01 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near, rootMargin]);

  return [ref, near] as const;
}

export function CommentsWidget({
  articleId,
  locale,
}: {
  articleId: string;
  locale: CommentLocale;
}) {
  const text = commentCopy[locale];
  const [sectionRef, activated] = useNearViewport<HTMLElement>();
  const titleId = useId();

  return (
    <section className={styles.shell} ref={sectionRef} aria-labelledby={titleId}>
      <header className={styles.header}>
        <div className="section-header">
          <h2 id={titleId}>{text.title}</h2>
        </div>
        <p>{text.intro}</p>
      </header>
      {activated ? <CommentList articleId={articleId} locale={locale} /> : <p className={styles.waiting}>{text.loading}</p>}
    </section>
  );
}

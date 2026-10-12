import { useEffect, useRef } from "react";
import type { LoadStatus } from "./use-comment-page";
import styles from "./comments.module.css";

export function AutoLoad({
  cursor,
  status,
  loadMore,
  label,
  loadingLabel,
}: {
  cursor: string | null | undefined;
  status: LoadStatus;
  loadMore: () => Promise<void>;
  label: string;
  loadingLabel: string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !cursor || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore();
      },
      { rootMargin: "500px 0px", threshold: 0.01 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  if (!cursor) return null;
  return (
    <div className={styles.autoLoad} ref={sentinelRef}>
      <button
        className="button button--quiet"
        disabled={status === "loading"}
        onClick={() => void loadMore()}
        type="button"
      >
        {status === "loading" ? loadingLabel : label}
      </button>
    </div>
  );
}

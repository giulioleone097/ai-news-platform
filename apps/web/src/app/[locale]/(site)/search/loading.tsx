import "@/styles/site/lists.css";

export default function SearchLoading() {
  return (
    <main className="site-shell archive-main" id="main-content" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="list-skeleton" aria-hidden="true">
        <span className="list-skeleton__title" />
        <span className="list-skeleton__field" />
        {Array.from({ length: 6 }, (_, index) => (
          <span className="list-skeleton__row" key={index} />
        ))}
      </div>
    </main>
  );
}

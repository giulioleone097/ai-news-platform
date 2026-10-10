export default function SearchLoading() {
  return (
    <main className="site-loading" id="main-content" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="site-loading__heading" />
      <div className="site-loading__hero" />
      <div className="site-loading__grid">
        <span />
        <span />
        <span />
      </div>
    </main>
  );
}

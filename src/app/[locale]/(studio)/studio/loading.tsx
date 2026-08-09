export default function StudioLoading() {
  return (
    <main className="studio-loading" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="studio-loading__heading" />
      <div className="studio-loading__metrics">
        <span />
        <span />
        <span />
      </div>
      <div className="studio-loading__panel" />
    </main>
  );
}

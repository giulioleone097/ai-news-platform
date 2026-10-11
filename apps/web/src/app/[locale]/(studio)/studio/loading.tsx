export default function StudioLoading() {
  return (
    <div className="studio-skeleton" aria-busy="true" aria-live="polite">
      <p className="sr-only">Loading…</p>
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

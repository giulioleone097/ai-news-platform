/** Canonical AtlasNews mark and the accessible brand name. */
export function BrandMark({ name }: { name: string }) {
  return (
    <>
      <span className="brand__mark" aria-hidden="true" />
      <span className="brand__name">{name}</span>
    </>
  );
}

/** The wordmark: the status meter, fully lit, on the marker, then the name. */
export function BrandMark({ name }: { name: string }) {
  return (
    <>
      <span className="brand__mark" aria-hidden="true"><i /><i /><i /><i /></span>
      <span className="brand__name">{name}</span>
    </>
  );
}

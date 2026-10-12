import { notFound } from "next/navigation";

// Any other URL under a locale ends here, so the 404 renders inside the site shell (see not-found.tsx).
export default function UnknownPage() {
  notFound();
}

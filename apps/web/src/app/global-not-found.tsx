import NotFound from "./not-found";

export { metadata } from "./not-found";

// Unmatched URLs have no locale, and each locale tree and /oauth own their root layout, so there
// is no layout to wrap this in. Enabled by `experimental.globalNotFound` in next.config.ts.
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <NotFound />
      </body>
    </html>
  );
}

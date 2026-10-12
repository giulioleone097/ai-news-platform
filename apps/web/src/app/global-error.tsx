"use client";

import { boundaryMessages } from "@/i18n/messages/boundary";

const { en, it } = boundaryMessages;

// Shown when a root layout itself fails, in place of the layout and the Next.js default screen. It brings its
// own document and no stylesheet (the page's CSS may be what failed), and it has no locale, so it says both
// languages as the global not-found page does. The OS decides light or dark; "Try again" reloads the page.
export default function GlobalError() {
  return (
    <html lang="en" style={{ colorScheme: "light dark" }}>
      <head>
        <title>{`${en.genericTitle} / ${it.genericTitle}`}</title>
      </head>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
        <main id="main-content" style={{ maxWidth: "32rem", margin: "0 auto", padding: "12vh 1.5rem" }}>
          <h1 lang="en" style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>{en.genericTitle}</h1>
          <p lang="en" style={{ margin: "0 0 1.5rem" }}>{en.genericDescription}</p>
          <h2 lang="it" style={{ fontSize: "1.125rem", margin: "0 0 0.5rem" }}>{it.genericTitle}</h2>
          <p lang="it" style={{ margin: "0 0 1.5rem" }}>{it.genericDescription}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ font: "inherit", minHeight: "2.75rem", padding: "0 1.25rem", cursor: "pointer" }}
            type="button"
          >
            <span lang="en">{en.retry}</span> / <span lang="it">{it.retry}</span>
          </button>
        </main>
      </body>
    </html>
  );
}

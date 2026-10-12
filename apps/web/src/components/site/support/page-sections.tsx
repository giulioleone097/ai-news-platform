import type { PageSection } from "./support-copy";
import styles from "./support.module.css";

/** The headed sections of the support and legal pages: paragraphs first, then an optional list. `nested` sets them as questions under a heading of the page. */
export function PageSections({ sections, nested }: { sections: readonly PageSection[]; nested?: boolean }) {
  const Heading = nested ? "h3" : "h2";
  return (
    <>
      {sections.map((section) => (
        <section aria-labelledby={`${section.id}-title`} className={nested ? styles.question : styles.section} key={section.id}>
          <Heading id={`${section.id}-title`}>{section.heading}</Heading>
          {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {section.items ? <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        </section>
      ))}
    </>
  );
}

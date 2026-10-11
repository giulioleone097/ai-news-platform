import type { PageSection } from "./support-copy";
import styles from "./support.module.css";

/** The headed sections of the support and legal pages: paragraphs first, then an optional list. */
export function PageSections({ sections }: { sections: readonly PageSection[] }) {
  return (
    <>
      {sections.map((section) => (
        <section aria-labelledby={`${section.id}-title`} className={styles.section} key={section.id}>
          <h2 id={`${section.id}-title`}>{section.heading}</h2>
          {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {section.items ? <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        </section>
      ))}
    </>
  );
}

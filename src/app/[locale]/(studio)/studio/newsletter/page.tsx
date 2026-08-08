import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, CheckCircle2, Mail } from "lucide-react";
import { studioSupplementalCopy } from "@/components/studio/studio-copy";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getStudioEditorialRepositories } from "@/modules/editorial/infrastructure/container";

export const metadata: Metadata = { robots: { index: false } };

export default async function StudioNewsletterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const repositories = await getStudioEditorialRepositories();
  const messages = getMessages(locale);
  const copy = studioSupplementalCopy[locale];

  return (
    <>
      <header className="studio-page-header">
        <div>
          <p className="studio-kicker">{messages.studio.newsletter}</p>
          <h1>{copy.newsletterTitle}</h1>
          <p>{copy.newsletterDescription}</p>
        </div>
      </header>

      <section className="studio-capability-card" aria-labelledby="newsletter-capability-title">
        <span className="studio-capability-card__icon" aria-hidden="true">
          <Mail size={30} strokeWidth={1.5} />
        </span>
        <div>
          <p className="studio-kicker">{repositories.mode === "demo" ? messages.studio.demoMode : messages.studio.authenticatedMode}</p>
          <h2 id="newsletter-capability-title">
            <CheckCircle2 aria-hidden="true" size={20} />
            {copy.newsletterCapability}
          </h2>
          <p>{messages.newsletter.description}</p>
        </div>
        <Link className="studio-button studio-button--secondary" href={`/${locale}`} target="_blank">
          {copy.openBriefing}
          <ArrowUpRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <aside className="studio-boundary-note">
        <span>API / WRITE</span>
        <p>{copy.newsletterBoundary}</p>
      </aside>
    </>
  );
}

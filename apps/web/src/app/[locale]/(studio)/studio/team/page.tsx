import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContentMode } from "@atlasnews/adapters/config/env";
import { InviteForm } from "@/components/studio/team/invite-form";
import { listTeamRows } from "@/components/studio/team/team-data";
import { TeamList } from "@/components/studio/team/team-list";
import { Note } from "@/components/studio/note";
import { PageHead } from "@/components/studio/page-head";
import { isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { teamCopy } from "./copy";

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function StudioTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ invited?: string; updated?: string; removed?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();

  const editor = await requireEditor(locale);
  // Managing the team is for admins. An editor gets the same page as for an address that does not exist;
  // the capabilities check the permission again, so this only keeps the page from being listed to them.
  if (editor.role !== "admin") notFound();

  const members = await listTeamRows(locale);
  const copy = teamCopy[locale];
  const notice = query.invited === "sent"
    ? copy.invitationSent
    : query.invited === "saved"
      ? copy.invitationSaved
      : query.updated
        ? copy.roleUpdated
        : query.removed
          ? copy.removed
          : null;

  return (
    <>
      <PageHead description={copy.description} title={copy.title} />

      {notice ? <Note tone="success">{notice}</Note> : null}

      <section className="studio-stack" aria-labelledby="team-invite-title">
        <h2 className="studio-section__title" id="team-invite-title">{copy.inviteTitle}</h2>
        <InviteForm locale={locale} />
      </section>

      <section className="studio-stack" aria-labelledby="team-members-title">
        <h2 className="studio-section__title" id="team-members-title">{copy.members}</h2>
        <TeamList currentAuthorId={editor.author.id} locale={locale} members={members} />
        {getContentMode() === "sites" ? <p className="studio-muted">{copy.sitesListNote}</p> : null}
      </section>
    </>
  );
}

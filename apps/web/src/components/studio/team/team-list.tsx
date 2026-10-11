import type { Locale } from "@/i18n";
import { teamCopy } from "@/app/[locale]/(studio)/studio/team/copy";
import { RemoveMemberButton } from "./remove-member-button";
import { RoleForm } from "./role-form";
import type { TeamRow } from "./team-data";
import styles from "./team.module.css";

export function TeamList({
  currentAuthorId,
  locale,
  members,
}: {
  /** The signed-in admin's own author: their row cannot be removed (the rule is enforced in the service too). */
  currentAuthorId: string;
  locale: Locale;
  members: TeamRow[];
}) {
  const copy = teamCopy[locale];

  return (
    <div className="studio-table-wrap">
      <table className="studio-table">
        <thead>
          <tr>
            <th>{copy.member}</th>
            <th>{copy.status}</th>
            <th>{copy.role}</th>
            <th>
              <span className="sr-only">{copy.actions}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const isYou = member.authorId === currentAuthorId;
            return (
              <tr key={member.id}>
                <td data-label={copy.member}>
                  <span className={styles.identity}>
                    <strong>{member.authorName}{isYou ? ` (${copy.you})` : ""}</strong>
                    <span>{member.email}</span>
                  </span>
                </td>
                <td data-label={copy.status}>
                  <span className={`studio-status ${member.status === "active" ? "studio-status--published" : "studio-status--review"}`}>
                    {member.status === "active" ? copy.active : copy.invited}
                  </span>
                </td>
                <td data-label={copy.role}>
                  <RoleForm email={member.email} id={member.id} locale={locale} role={member.role} />
                </td>
                <td>
                  <span className={styles.rowActions}>
                    {isYou ? null : <RemoveMemberButton email={member.email} id={member.id} locale={locale} />}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

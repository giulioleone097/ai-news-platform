import type { Locale } from "@/i18n";
import { teamCopy } from "@/app/[locale]/(studio)/studio/team/copy";
import { Badge } from "../badge";
import { RemoveMemberButton } from "./remove-member-button";
import { RoleForm } from "./role-form";
import type { TeamRow } from "./team-data";

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
                <td className="studio-table__main">
                  <span className="studio-cell">
                    <strong>{member.authorName}{isYou ? ` (${copy.you})` : ""}</strong>
                    <small>{member.email}</small>
                  </span>
                </td>
                <td data-label={copy.status}>
                  <Badge tone={member.status === "active" ? "success" : "warning"}>
                    {member.status === "active" ? copy.active : copy.invited}
                  </Badge>
                </td>
                <td data-label={copy.role}>
                  <RoleForm email={member.email} id={member.id} locale={locale} role={member.role} />
                </td>
                <td className="studio-table__actions">
                  <span className="studio-actions">
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

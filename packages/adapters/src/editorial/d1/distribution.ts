import type { DistributionRepository } from "@atlasnews/core/editorial/domain/article-repository";
import { distributionStatuses, type DistributionUpdate } from "@atlasnews/core/editorial/domain/editorial-operations";
import type { Locale } from "@atlasnews/core/locale";
import { D1EditorialAccess } from "./access";
import { mapPublication, publicationSelect, toTimestamp, type PublicationRow } from "./sql";

/** The social publications of the articles. Editors only: the public audience sees none. */
export class D1DistributionRepository extends D1EditorialAccess implements DistributionRepository {
  async listPublications(locale: Locale) {
    // social_publications was readable by editors and the service role only.
    if (this.options.audience !== "editorial") return [];
    const rows = await this.rows<PublicationRow>(
      `${publicationSelect} WHERE a.locale = ? ORDER BY s.updated_at DESC, s.id DESC LIMIT 200`,
      locale,
    );
    return rows.map(mapPublication);
  }

  async updatePublication(input: DistributionUpdate) {
    this.assertEditorial();
    if (!distributionStatuses.includes(input.status)) throw new Error("Unable to update distribution publication: Invalid distribution status");
    const timestamp = new Date().toISOString();
    const [updated] = await this.batch("Unable to update distribution publication", [
      this.database
        .prepare(
          `UPDATE social_publications SET status = ?, message = nullif(trim(?), ''), external_url = nullif(trim(?), ''),
             scheduled_for = ?, updated_at = ?,
             published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE NULL END
           WHERE id = ? RETURNING id`,
        )
        .bind(
          input.status,
          input.message?.trim() || null,
          input.externalUrl || null,
          toTimestamp(input.scheduledFor),
          timestamp,
          input.status,
          timestamp,
          input.id,
        ),
    ]);
    if (!updated.results.length) throw new Error("Unable to update distribution publication: Distribution publication not found");
    const [row] = await this.rows<PublicationRow>(`${publicationSelect} WHERE s.id = ?`, input.id);
    return mapPublication(row);
  }
}

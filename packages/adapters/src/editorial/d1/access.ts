import type { NewsletterRepository } from "@atlasnews/core/editorial/domain/article-repository";
import type { D1Database, D1PreparedStatement, R2Bucket } from "../../sites/cloudflare";
import { errorMessage } from "./sql";

export type D1EditorialRepositoryOptions = {
  /** `public` serves the anonymous site: published stories only, no distribution; `editorial` serves Studio and admin MCP. */
  audience: "public" | "editorial";
  /** The R2 bucket for media; without one the repository is not `writable` and lists no assets. */
  media: R2Bucket | null;
  /** Subscribers live in the newsletter adapter; the newsletter methods of this repository delegate to it. */
  newsletter: NewsletterRepository;
  /** The signed-in editor's author id; writes that record an author need it. */
  actorAuthorId?: () => Promise<string | null>;
};


/** What every D1 editorial port needs: the database, the audience and the guarded ways of reading and writing. */
export class D1EditorialAccess {
  constructor(
    protected readonly database: D1Database,
    protected readonly options: D1EditorialRepositoryOptions,
  ) {}

  /** What the anonymous role could not do in Postgres: every write except subscribing. */
  protected assertEditorial() {
    if (this.options.audience !== "editorial") throw new Error("Editorial access is required");
  }

  protected async getActorAuthorId() {
    const authorId = await this.options.actorAuthorId?.();
    if (!authorId) throw new Error("An authenticated editor is required");
    return authorId;
  }

  protected async rows<T>(sql: string, ...binds: unknown[]) {
    return (await this.database.prepare(sql).bind(...binds).all<T>()).results;
  }

  /** Runs the statements as one transaction; a failure says what could not be done, then why. */
  protected async batch(context: string, statements: D1PreparedStatement[]) {
    try {
      return await this.database.batch(statements);
    } catch (error) {
      throw new Error(`${context}: ${errorMessage(error)}`, { cause: error });
    }
  }
}

/**
 * The parts of the Cloudflare D1 and R2 binding APIs that the Sites adapters use. ChatGPT Sites runs the
 * site as a Cloudflare Worker and injects the bindings named in `.openai/hosting.json`; declaring the
 * subset here keeps `@cloudflare/workers-types` (whose globals clash with the DOM types) out of the
 * packages, and lets tests pass a Miniflare binding.
 */
export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { changes: number; last_row_id: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  /** Runs the statements in one implicit transaction: all of them apply, or none. */
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface R2HttpMetadata {
  contentType?: string;
  cacheControl?: string;
}

export interface R2Object {
  key: string;
  size: number;
  uploaded: Date;
  httpEtag: string;
  httpMetadata?: R2HttpMetadata;
  customMetadata?: Record<string, string>;
}

export interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
}

export interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
    options?: { httpMetadata?: R2HttpMetadata; customMetadata?: Record<string, string> },
  ): Promise<R2Object | null>;
  /** Deletes up to 1000 keys in one call. */
  delete(keys: string | string[]): Promise<void>;
  list(options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
    /** Returns the metadata of each object too; R2 omits it otherwise. */
    include?: ("httpMetadata" | "customMetadata")[];
  }): Promise<R2Objects>;
}

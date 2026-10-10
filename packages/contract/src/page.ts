import * as z from "zod/v4";

import type { Annotations } from "./capability";
import { pageSpecs } from "./specs/page";

/** A capability of the open page as plain data: safe to serialise and to import in a client bundle. */
export interface PageCapability {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** JSON Schema (2020-12) of the arguments. */
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: Annotations;
}

export const pageCapabilities: readonly PageCapability[] = pageSpecs.map((spec) => ({
  name: spec.name,
  title: spec.title,
  description: spec.description,
  inputSchema: z.toJSONSchema(spec.input, { io: "input" }) as Record<string, unknown>,
  annotations: spec.annotations,
}));

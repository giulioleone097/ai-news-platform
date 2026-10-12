export interface StudioActionState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** A form that creates something: the id of what an earlier try already created, so a retry updates it. */
  articleId?: string;
}

export const idleStudioActionState: StudioActionState = { status: "idle" };

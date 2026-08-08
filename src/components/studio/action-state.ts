export interface StudioActionState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

export const idleStudioActionState: StudioActionState = { status: "idle" };

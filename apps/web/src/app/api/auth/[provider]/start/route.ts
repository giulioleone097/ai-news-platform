import type { NextRequest } from "next/server";
import { startSignIn } from "@/lib/auth/handlers";

export const dynamic = "force-dynamic";

/** Starts sign-in with Google or GitHub: `?return_to=` is a path on this site to come back to. */
export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  return startSignIn(request, (await context.params).provider);
}

import type { NextRequest } from "next/server";
import { signOut } from "@/lib/auth/handlers";

export const dynamic = "force-dynamic";

/** Ends the Google or GitHub session (and a Supabase one). ChatGPT sign-out stays the platform's own path. */
export async function POST(request: NextRequest) {
  return signOut(request);
}

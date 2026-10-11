import type { NextRequest } from "next/server";
import { finishSignIn } from "@/lib/auth/handlers";

export const dynamic = "force-dynamic";

/** Where Google or GitHub sends the browser back. Register `https://<site>/api/auth/<provider>/callback`. */
export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  return finishSignIn(request, (await context.params).provider);
}

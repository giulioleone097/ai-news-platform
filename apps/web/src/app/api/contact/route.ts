import type { NextRequest } from "next/server";
import { handleContactRequest } from "@/server/contact/http";
import { getContactMessageService } from "@/server/composition";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleContactRequest(request, getContactMessageService);
}

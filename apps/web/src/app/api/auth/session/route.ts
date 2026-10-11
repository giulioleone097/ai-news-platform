import { describeSession } from "@/lib/auth/handlers";
import { getSignedInUser } from "@/lib/editor-auth";

export const dynamic = "force-dynamic";

/** For the comment section: the ways to sign in on this deployment and who is signed in, if anybody. */
export async function GET() {
  return describeSession(getSignedInUser);
}

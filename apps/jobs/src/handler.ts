import * as commentNotifications from "./workers/comment-notifications";
import * as mcpEvents from "./workers/mcp-events";
import * as newsletterOutbox from "./workers/newsletter-outbox";
import * as socialOutbox from "./workers/social-outbox";

type Worker = Partial<Record<string, (request: Request) => Response | Promise<Response>>>;

const workers: Record<string, Worker> = {
  "/internal/social-outbox": socialOutbox,
  "/internal/newsletter-outbox": newsletterOutbox,
  "/internal/comment-notifications": commentNotifications,
  "/internal/mcp-events": mcpEvents,
};

/** Web-standard handler for the background workers; each one checks the `CRON_SECRET` bearer itself. */
export async function handleJobsRequest(request: Request): Promise<Response> {
  const worker = workers[new URL(request.url).pathname];
  if (!worker) return Response.json({ error: "not_found" }, { status: 404 });
  const run = worker[request.method];
  return run
    ? run(request)
    : new Response(null, { status: 405, headers: { Allow: Object.keys(worker).join(", ") } });
}

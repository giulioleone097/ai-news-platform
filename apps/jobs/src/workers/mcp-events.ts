import { authorizeCronRequest } from "../cron-auth";
import { createMcpEventsWorker } from "@atlasnews/adapters/mcp-events/runtime";

async function processMcpEvents(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (!authorization.ok) return Response.json(
    { error: authorization.status === 503 ? "cron_not_configured" : "unauthorized" },
    {
      status: authorization.status,
      headers: { "Cache-Control": "no-store" },
    },
  );

  try {
    const worker = createMcpEventsWorker();
    if (!worker) {
      return Response.json({ error: "mcp_events_not_configured" }, {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return Response.json(await worker.run(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "mcp_events_unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export const GET = processMcpEvents;
export const POST = processMcpEvents;

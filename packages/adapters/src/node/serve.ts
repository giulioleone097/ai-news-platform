import { createServer, type IncomingMessage } from "node:http";
import { Readable } from "node:stream";

export type FetchHandler = (request: Request) => Response | Promise<Response>;

function toRequest(incoming: IncomingMessage, signal: AbortSignal) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else if (value !== undefined) headers.set(name, value);
  }
  const method = incoming.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(new URL(incoming.url ?? "/", `http://${incoming.headers.host ?? "localhost"}`), {
    method,
    headers,
    signal,
    ...(hasBody ? { body: Readable.toWeb(incoming) as ReadableStream, duplex: "half" } : {}),
  });
}

/** Serves a Web-standard fetch handler from a plain Node HTTP server. */
export function serveFetchHandler(handler: FetchHandler, options: { name: string; port: number }) {
  const server = createServer(async (incoming, outgoing) => {
    const aborted = new AbortController();
    outgoing.on("close", () => aborted.abort());
    try {
      const response = await handler(toRequest(incoming, aborted.signal));
      outgoing.writeHead(response.status, [...response.headers].flat());
      if (response.body && incoming.method !== "HEAD") {
        Readable.fromWeb(response.body as import("node:stream/web").ReadableStream).pipe(outgoing);
      } else {
        outgoing.end();
      }
    } catch {
      outgoing.writeHead(500, { "Content-Type": "application/json" });
      outgoing.end(JSON.stringify({ error: "internal_error" }));
    }
  });
  server.listen(options.port, () => {
    console.log(`${options.name} listening on http://localhost:${options.port}`);
  });
  return server;
}

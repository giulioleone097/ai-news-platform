import { describe, expect, it } from "vitest";
import { readLimitedBody } from "./http";

describe("newsletter HTTP body limits", () => {
  it("cancels an oversized stream before buffering the remaining chunks", async () => {
    const encoder = new TextEncoder();
    let cancelled = false;
    let pulled = 0;
    const totalChunks = 100;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(encoder.encode("1234"));
        if (pulled === totalChunks) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("https://news.example.com/api/webhooks/newsletter/subscribe", {
      body: stream,
      duplex: "half",
      method: "POST",
    } as RequestInit & { duplex: "half" });

    await expect(readLimitedBody(request, 8)).rejects.toThrow("Request body too large");
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(totalChunks);
  });

  it("decodes a bounded UTF-8 stream without changing its bytes", async () => {
    const value = '{"email":"lettore@example.com","locale":"it"}';
    const encoded = new TextEncoder().encode(value);
    const request = new Request("https://news.example.com/api/webhooks/newsletter/subscribe", {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoded.slice(0, 7));
          controller.enqueue(encoded.slice(7));
          controller.close();
        },
      }),
      duplex: "half",
      method: "POST",
    } as RequestInit & { duplex: "half" });

    await expect(readLimitedBody(request, encoded.byteLength)).resolves.toBe(value);
  });
});

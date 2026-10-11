import { isIP } from "node:net";

import { WebhookTransportError } from "@atlasnews/core/mcp-events/domain/errors";
import type { WebhookClient, WebhookRequest, WebhookResponse } from "@atlasnews/core/mcp-events/domain/ports";

// Same limits as safe-https-client.ts.
const maximumRequestBodyBytes = 256 * 1024;
const maximumResponseBytes = 8 * 1024;

function failure(reason: WebhookTransportError["reason"], message: string) {
  return new WebhookTransportError(reason, message);
}

/** Hostnames that name the local machine or an internal network rather than a public site. */
function isInternalHostname(hostname: string) {
  return !hostname.includes(".")
    || ["localhost", "local", "internal", "localdomain", "home.arpa"].some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    );
}

function assertPublicHttpsUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw failure("invalid_url", "Callback URL is not valid.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw failure("invalid_url", "Callback URL must be HTTPS without credentials.");
  }
  // `new URL` has already normalized decimal, octal and hex IPv4 spellings to dotted form.
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (isIP(hostname) || isInternalHostname(hostname)) {
    throw failure("blocked_address", "Callback host must be a public DNS name.");
  }
  return url;
}

async function readCapped(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (received < maximumResponseBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const bytes = new Uint8Array(Math.min(received, maximumResponseBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.byteLength - offset);
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Webhook client for the Workers runtime (ChatGPT Sites), built on the global `fetch`.
 *
 * It applies the same destination policy as `SafeHttpsWebhookClient`: HTTPS only, no credentials, no
 * redirects followed, a timeout, a capped response, and no IP-literal, loopback, private or link-local
 * hosts. A Worker cannot open connections to private networks (its outbound traffic leaves through
 * Cloudflare's edge), and `fetch` gives no hook to pin a resolved address, so unlike the Node client
 * there is no DNS pinning here: the hostname checks above are the policy, and the platform is the
 * network boundary.
 */
export class FetchHttpsWebhookClient implements WebhookClient {
  constructor(private readonly fetcher: typeof fetch = (input, init) => fetch(input, init)) {}

  async post(input: WebhookRequest): Promise<WebhookResponse> {
    const url = assertPublicHttpsUrl(input.url);
    if (new TextEncoder().encode(input.body).byteLength > maximumRequestBodyBytes) {
      throw failure("payload_too_large", "Webhook body exceeds 256 KiB.");
    }

    const signal = AbortSignal.timeout(input.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        method: "POST",
        headers: input.headers,
        body: input.body,
        redirect: "manual",
        signal,
      });
      return { status: response.status, body: await readCapped(response) };
    } catch (error) {
      if (signal.aborted) throw failure("timeout", "Webhook request timed out.");
      throw error instanceof WebhookTransportError ? error : failure("network", "Webhook request failed.");
    }
  }
}

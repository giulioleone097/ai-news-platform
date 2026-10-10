import { lookup as dnsLookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";

import { WebhookTransportError } from "../domain/errors";
import type { WebhookClient, WebhookRequest, WebhookResponse } from "../domain/ports";
import { isPublicAddress } from "./address-policy";

export const maximumRequestBodyBytes = 256 * 1024;
const maximumResponseBytes = 8 * 1024;

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type AddressResolver = (hostname: string) => Promise<ResolvedAddress[]>;

const defaultResolver: AddressResolver = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

function failure(reason: WebhookTransportError["reason"], message: string) {
  return new WebhookTransportError(reason, message);
}

/** Resolves the host and returns an address only when every candidate is public. */
async function resolvePublicAddress(hostname: string, resolver: AddressResolver) {
  const bare = hostname.replace(/^\[|\]$/g, "");
  let addresses: ResolvedAddress[];
  if (isIP(bare)) {
    addresses = [{ address: bare, family: isIP(bare) }];
  } else {
    try {
      addresses = await resolver(bare);
    } catch {
      throw failure("network", "Callback host could not be resolved.");
    }
  }
  if (!addresses.length) throw failure("network", "Callback host has no addresses.");
  if (!addresses.every((candidate) => isPublicAddress(candidate.address))) {
    throw failure("blocked_address", "Callback host resolves to a non-public address.");
  }
  return addresses[0];
}

/**
 * HTTPS POST client for webhooks: HTTPS only, no credentials, no redirects, public
 * destinations only. The connection is made to the validated address (custom `lookup`)
 * while the URL hostname still drives Host, TLS SNI and certificate verification.
 */
export class SafeHttpsWebhookClient implements WebhookClient {
  constructor(
    private readonly resolver: AddressResolver = defaultResolver,
    private readonly request: typeof https.request = https.request,
  ) {}

  async post(input: WebhookRequest): Promise<WebhookResponse> {
    let url: URL;
    try {
      url = new URL(input.url);
    } catch {
      throw failure("invalid_url", "Callback URL is not valid.");
    }
    if (url.protocol !== "https:" || url.username || url.password) {
      throw failure("invalid_url", "Callback URL must be HTTPS without credentials.");
    }
    const bytes = Buffer.from(input.body, "utf8");
    if (bytes.byteLength > maximumRequestBodyBytes) {
      throw failure("payload_too_large", "Webhook body exceeds 256 KiB.");
    }

    const target = await resolvePublicAddress(url.hostname, this.resolver);
    return this.send(url, target, bytes, input).catch((error: unknown) => {
      throw error instanceof WebhookTransportError ? error : failure("network", "Webhook request failed.");
    });
  }

  private send(url: URL, target: ResolvedAddress, body: Buffer, input: WebhookRequest) {
    return new Promise<WebhookResponse>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        const error = failure("timeout", "Webhook request timed out.");
        settle(() => reject(error));
        request.destroy(error);
      }, input.timeoutMs);
      const settle = (action: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        action();
      };

      const request = this.request(
        {
          protocol: "https:",
          hostname: url.hostname.replace(/^\[|\]$/g, ""),
          port: url.port || 443,
          path: `${url.pathname}${url.search}`,
          method: "POST",
          agent: false,
          headers: { ...input.headers, "Content-Length": String(body.byteLength) },
          lookup: (_hostname, options, callback) => {
            if ((options as { all?: boolean }).all) {
              (callback as unknown as (error: null, addresses: ResolvedAddress[]) => void)(null, [target]);
            } else {
              callback(null, target.address, target.family);
            }
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          let received = 0;
          response.on("data", (chunk: Buffer) => {
            received += chunk.byteLength;
            if (received <= maximumResponseBytes) chunks.push(chunk);
            else response.destroy();
          });
          const finish = () => settle(() => resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          }));
          response.on("end", finish);
          response.on("close", finish);
          response.on("error", finish);
        },
      );
      request.on("error", (error) => settle(() => reject(
        error instanceof WebhookTransportError ? error : failure("network", "Webhook request failed."),
      )));
      request.end(body);
    });
  }
}

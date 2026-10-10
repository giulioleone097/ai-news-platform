import { randomBytes, timingSafeEqual } from "node:crypto";

import {
  WebhookTransportError,
  callbackError,
  type CallbackFailureReason,
} from "../domain/errors";
import type { WebhookClient } from "../domain/ports";
import { buildWebhookHeaders } from "./webhook-signing";

export const verificationTimeoutMs = 5_000;

function constantTimeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

function transportReason(error: unknown): CallbackFailureReason {
  if (error instanceof WebhookTransportError
    && (error.reason === "timeout" || error.reason === "invalid_url" || error.reason === "blocked_address")) {
    return error.reason;
  }
  return "http_error";
}

function echoedChallenge(body: string) {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && "challenge" in parsed
      && typeof parsed.challenge === "string") {
      return parsed.challenge;
    }
  } catch {
    // Fall through: a non-JSON answer is a failed challenge.
  }
  return null;
}

/** Proves the callback owner can receive signed requests and echo a fresh single-use challenge. */
export class CallbackVerifier {
  constructor(
    private readonly client: WebhookClient,
    private readonly clock: () => Date = () => new Date(),
    private readonly randomToken: () => string = () => randomBytes(24).toString("base64url"),
  ) {}

  async verify(input: { url: string; subscriptionId: string; secret: string }) {
    const challenge = this.randomToken();
    const body = JSON.stringify({ type: "verification", challenge });
    const headers = buildWebhookHeaders({
      messageId: `msg_verification_${this.randomToken()}`,
      subscriptionId: input.subscriptionId,
      secrets: [input.secret],
      body,
      now: this.clock(),
    });

    let response;
    try {
      response = await this.client.post({
        url: input.url,
        headers,
        body,
        timeoutMs: verificationTimeoutMs,
      });
    } catch (error) {
      const reason = transportReason(error);
      throw callbackError(reason, `Callback verification failed: ${reason}.`);
    }

    if (response.status < 200 || response.status > 299) {
      throw callbackError("http_error", `Callback answered HTTP ${response.status}.`);
    }
    const echoed = echoedChallenge(response.body);
    if (echoed === null || !constantTimeEqual(echoed, challenge)) {
      throw callbackError("challenge_failed", "Callback did not echo the verification challenge.");
    }
  }
}

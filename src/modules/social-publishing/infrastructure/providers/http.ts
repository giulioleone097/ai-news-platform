import { SocialProviderError, SocialPublishingConfigurationError } from "../../domain/errors";
import type { SocialProvider } from "../../domain/social-publication";
import { redactProviderError, safeProviderCode } from "../../application/error-redaction";
import type { ProviderTransportConfig, SocialFetch } from "./config";

const maximumResponseBytes = 64 * 1_024;

export interface ProviderTransport {
  accessToken: string;
  fetch: SocialFetch;
  timeoutMs: number;
}

function assertHeaderSecret(value: string, name: string) {
  const secret = value?.trim();
  if (!secret || secret.length < 20 || /[\r\n]/.test(secret)) {
    throw new SocialPublishingConfigurationError(`${name} is not configured.`);
  }
  return secret;
}

export function createProviderTransport(
  config: ProviderTransportConfig,
  tokenName: string,
): ProviderTransport {
  const timeoutMs = config.timeoutMs ?? 15_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new SocialPublishingConfigurationError("Invalid provider timeout.");
  }
  return {
    accessToken: assertHeaderSecret(config.accessToken, tokenName),
    fetch: config.fetch ?? fetch,
    timeoutMs,
  };
}

async function readBoundedText(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumResponseBytes) {
        await reader.cancel();
        return "";
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function readProviderJson(response: Response): Promise<unknown> {
  const text = await readBoundedText(response);
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function retryAfterSeconds(response: Response) {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(Math.max(Math.ceil(seconds), 0), 21_600);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.min(Math.max(Math.ceil((date - Date.now()) / 1_000), 0), 21_600);
}

function errorDetail(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const nested = record.error && typeof record.error === "object"
    ? record.error as Record<string, unknown>
    : null;
  return {
    code: nested?.code ?? record.code ?? record.status,
    message: nested?.message ?? record.detail ?? record.title ?? record.message,
  };
}

export async function throwProviderHttpError(
  provider: SocialProvider,
  response: Response,
): Promise<never> {
  const detail = errorDetail(await readProviderJson(response));
  const rateLimited = response.status === 429;
  const outcomeUnknown = response.status >= 500;
  throw new SocialProviderError(
    provider,
    safeProviderCode(detail?.code, `${provider}_http_${response.status}`),
    redactProviderError(detail?.message, `${provider} rejected the request (${response.status}).`),
    rateLimited,
    outcomeUnknown,
    rateLimited ? retryAfterSeconds(response) : undefined,
  );
}

export async function providerFetch(
  provider: SocialProvider,
  transport: ProviderTransport,
  url: string,
  init: RequestInit,
) {
  try {
    return await transport.fetch(url, {
      ...init,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(transport.timeoutMs),
    });
  } catch (error) {
    throw new SocialProviderError(
      provider,
      `${provider}_transport_unknown`,
      redactProviderError(error, `${provider} transport failed.`),
      false,
      true,
    );
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

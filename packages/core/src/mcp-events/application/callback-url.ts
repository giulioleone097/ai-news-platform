import { callbackError } from "../domain/errors";

const maximumUrlLength = 2048;

/** Syntactic callback policy; address safety is enforced by the outbound client at connect time. */
export function parseCallbackUrl(value: string): URL {
  let url: URL;
  try {
    if (value.length > maximumUrlLength) throw new Error("too long");
    url = new URL(value);
  } catch {
    throw callbackError("invalid_url", "Callback URL is not a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw callbackError("invalid_url", "Callback URL must use HTTPS.");
  }
  if (url.username || url.password) {
    throw callbackError("invalid_url", "Callback URL must not contain credentials.");
  }
  if (!url.hostname) throw callbackError("invalid_url", "Callback URL needs a host.");
  url.hash = "";
  return url;
}

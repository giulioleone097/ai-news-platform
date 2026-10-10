import { getClientNetwork } from "@atlasnews/adapters/config/client-address";

/**
 * Key for the per-network rate limits (comments, newsletter requests): the client network read from the
 * one header named by `ATLASNEWS_CLIENT_IP_HEADER`, which the edge in front of the site must set itself.
 *
 * Without a trusted header there is no honest network identity, and a header the client can set must not
 * pick the bucket. The request then gets a bucket of its own, so the per-network limits do not bind;
 * the per-visitor, per-address and global limits still do. A shared "unknown" bucket would let one
 * client exhaust the limit for everyone.
 */
export function getRequestNetworkAddress(headers: Headers) {
  return getClientNetwork(headers) ?? `unscoped:${crypto.randomUUID()}`;
}

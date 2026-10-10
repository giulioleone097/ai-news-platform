const secretPrefix = "whsec_";
const minimumKeyBytes = 24;
const maximumKeyBytes = 64;
const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;

/** Returns the raw HMAC key of a Standard Webhooks secret, or null when it is not acceptable. */
export function decodeSigningSecret(secret: string): Buffer | null {
  if (!secret.startsWith(secretPrefix)) return null;
  const encoded = secret.slice(secretPrefix.length);
  if (!encoded || encoded.length % 4 !== 0 || !base64Pattern.test(encoded)) return null;
  const key = Buffer.from(encoded, "base64");
  return key.byteLength >= minimumKeyBytes && key.byteLength <= maximumKeyBytes ? key : null;
}

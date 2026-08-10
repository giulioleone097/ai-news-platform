export type SocialFetch = typeof fetch;

export interface ProviderTransportConfig {
  accessToken: string;
  fetch?: SocialFetch;
  timeoutMs?: number;
}

export interface LinkedInProviderConfig extends ProviderTransportConfig {
  authorUrn: string;
  apiVersion: string;
}

export type XProviderConfig = ProviderTransportConfig;

export interface WhatsAppProviderConfig extends ProviderTransportConfig {
  phoneNumberId: string;
  apiVersion: string;
}

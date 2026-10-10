import type { SocialProvider } from "./social-publication";

export class SocialPublishingError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "SocialPublishingError";
  }
}

export class SocialPublishingConfigurationError extends SocialPublishingError {
  constructor(message = "Social publishing is not configured.") {
    super(message, "configuration_error");
    this.name = "SocialPublishingConfigurationError";
  }
}

export class SocialProviderError extends SocialPublishingError {
  constructor(
    readonly provider: SocialProvider,
    code: string,
    message: string,
    readonly retryable: boolean,
    readonly outcomeUnknown: boolean,
    readonly retryAfterSeconds?: number,
  ) {
    super(message, code);
    this.name = "SocialProviderError";
  }
}

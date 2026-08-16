/**
 * Dependency-free runtime shape check for RemoteConfig.
 *
 * A valid JSON payload may still have the wrong shape (missing fields, wrong
 * types, nested objects that are null).  This guard rejects any value that
 * would fail downstream by checking every top-level field the application
 * actually reads.  The check is deliberately shallow for `network` entries —
 * deep validation of every provider would couple the guard to every schema
 * change — but it ensures the overall shape is sound.
 */

import { RemoteConfig } from "../../models/network-models";

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0;

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((item) => typeof item === "string");

/**
 * Validate a parsed JSON value against the RemoteConfig shape the application
 * needs.  Returns true when the shape is valid, false otherwise.
 */
export const isValidRemoteConfig = (value: unknown): value is RemoteConfig => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Required top-level scalars
  if (!isNonEmptyString(obj.currentVersionNumber)) return false;
  if (!isNonEmptyString(obj.minVersionNumber)) return false;
  if (!isNonEmptyString(obj.wakuPubSubTopic)) return false;

  // Required top-level arrays
  if (!isStringArray(obj.bootstrap)) return false;
  if (!isStringArray(obj.additionalDirectPeers)) return false;
  if (!isStringArray(obj.blacklist)) return false;
  if (!isStringArray(obj.publicPoiAggregatorUrls)) return false;

  // trustedFeeSigner: string or string[]
  const signer = obj.trustedFeeSigner;
  if (
    typeof signer !== "string" &&
    !(Array.isArray(signer) && signer.every((s) => typeof s === "string"))
  ) {
    return false;
  }

  // network: must be a non-null object (Record<number, ChainConfig>)
  const { network } = obj;
  if (
    network === null ||
    typeof network !== "object" ||
    Array.isArray(network)
  ) {
    return false;
  }
  const entries = Object.values(network as Record<string, unknown>);
  if (entries.length === 0) return false;
  for (const entry of entries) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return false;
    }
    const chain = entry as Record<string, unknown>;
    if (!isNonEmptyString(chain.name)) return false;
    if (!Array.isArray(chain.providers) || chain.providers.length === 0)
      return false;
    for (const p of chain.providers) {
      if (typeof p === "string") {
        // URL string — accepted.
        continue;
      }
      // ProviderJson: must be a non-null object with a `provider` string field.
      if (
        p === null ||
        typeof p !== "object" ||
        Array.isArray(p) ||
        !isNonEmptyString((p as Record<string, unknown>).provider)
      ) {
        return false;
      }
    }
  }

  // apiKeys is optional; when present it must be an object
  if (obj.apiKeys !== undefined) {
    if (
      obj.apiKeys === null ||
      typeof obj.apiKeys !== "object" ||
      Array.isArray(obj.apiKeys)
    ) {
      return false;
    }
  }

  return true;
};

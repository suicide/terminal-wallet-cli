/**
 * Configurable artifact gateway.
 *
 * The Railgun wallet SDK hardcodes a single IPFS gateway for proving artifacts
 * (`services/artifacts/artifact-util.js`) and downloads each artifact with one
 * un-retried request. When that gateway is unavailable every private proof
 * fails, and the SDK surfaces it as the misleading "Invalid proof for this
 * transaction" because the batch download throws before a proof exists.
 *
 * An operator can list additional gateways under `artifactGateways` in their
 * `local-config.json` (gitignored), e.g. an internal IPFS node that already
 * holds the circuits. This module rewrites the SDK's gateway origin to each
 * configured entry in turn until one returns a verifiable artifact.
 *
 * The internal gateway address is operator-local: it lives only in
 * `local-config.json` and is never committed to this repository.
 */
import fs from "fs";
import path from "path";
import { ArtifactName } from "@railgun-community/shared-models";
import configDefaults from "../../config/config-defaults";
import { remoteConfig } from "../network/network-util";
import { createLogger } from "../../platform/logger";
import { ensureCircuitArtifacts, isKnownVariant } from "./circuit-artifact-source";

const log = createLogger("artifact-gateway");

/** The gateway the SDK ships with; always tried last as a fallback. */
export const OFFICIAL_ARTIFACT_GATEWAY = "https://ipfs-lb.com";

/**
 * Normalise one configured gateway to an origin (plus optional base path) with
 * no trailing slash and no `/ipfs` suffix. The SDK appends `/ipfs/<cid>/...`
 * itself, so a pasted gateway URL must not carry its own.
 *
 * Returns undefined for anything that is not an http(s) URL.
 */
export const normaliseArtifactGateway = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;

  const basePath = url.pathname
    .replace(/\/+$/, "")
    .replace(/\/ipfs$/, "");

  return `${url.origin}${basePath}`;
};

/**
 * Parse and validate a raw `artifactGateways` value. Invalid entries are
 * counted rather than thrown so a typo cannot break boot or the on-chain
 * config path; the caller decides how loudly to warn.
 */
export const parseArtifactGateways = (
  value: unknown,
): { gateways: string[]; rejected: number } => {
  if (!Array.isArray(value)) return { gateways: [], rejected: 0 };

  const gateways: string[] = [];
  let rejected = 0;
  for (const entry of value) {
    const normalised = normaliseArtifactGateway(entry);
    if (!normalised) {
      rejected += 1;
      continue;
    }
    if (!gateways.includes(normalised)) gateways.push(normalised);
  }
  return { gateways, rejected };
};

/**
 * Resolve the effective gateway list: configured entries first, the SDK's
 * built-in gateway last. Always returns at least one gateway.
 */
export const resolveArtifactGateways = (value: unknown): string[] => {
  const { gateways, rejected } = parseArtifactGateways(value);
  if (rejected > 0) {
    log.warn(
      `ignoring ${rejected} invalid artifactGateway entr${rejected === 1 ? "y" : "ies"} in local-config.json`,
    );
  }
  if (!gateways.includes(OFFICIAL_ARTIFACT_GATEWAY)) {
    gateways.push(OFFICIAL_ARTIFACT_GATEWAY);
  }
  return gateways;
};

/**
 * Replace the origin of an SDK artifact URL with `gateway`, keeping the
 * `/ipfs/<cid>/<path>` tail intact. Non-artifact URLs pass through untouched.
 */
export const replaceGatewayOrigin = (url: string, gateway: string): string => {
  const marker = "/ipfs/";
  const index = url.indexOf(marker);
  if (index === -1) return url;
  return `${gateway}${url.slice(index)}`;
};

/**
 * A downloaded vkey is accepted only if it parses to a snarkjs verification
 * key. The SDK does not hash vkeys (unlike zkey/wasm), so a gateway returning
 * an HTML or placeholder body would otherwise be stored and trusted forever.
 */
export const isValidVkeyArtifact = (data: unknown): boolean => {
  if (typeof data !== "string" && !Buffer.isBuffer(data)) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      typeof data === "string" ? data : data.toString("utf8"),
    );
  } catch {
    return false;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return false;
  }
  const vkey = parsed as Record<string, unknown>;
  return typeof vkey.protocol === "string" && typeof vkey.curve === "string";
};

type ArtifactDownloadStore = {
  get: (path: string) => Promise<string | Buffer | null>;
  exists: (path: string) => Promise<boolean>;
  store: (dir: string, path: string, item: string | Uint8Array) => Promise<void>;
};

type ArtifactDownloaderInstance = {
  artifactStore: ArtifactDownloadStore;
  downloadArtifact: (
    artifactName: ArtifactName,
    variant: string,
  ) => Promise<string>;
  downloadArtifacts: (variant: string) => Promise<void>;
};

type ArtifactDownloaderCtor = new (
  store: ArtifactDownloadStore,
  useNativeArtifacts: boolean,
) => ArtifactDownloaderInstance;

type ArtifactUtilModule = {
  getArtifactUrl: (artifactName: ArtifactName, variant: string) => string;
};

type ArtifactDownloaderModule = {
  ArtifactDownloader: ArtifactDownloaderCtor;
};

let installed = false;

const gatewayHost = (gateway: string): string => {
  try {
    return new URL(gateway).host;
  } catch {
    return gateway;
  }
};

const removeStoredArtifact = async (relativePath: string): Promise<void> => {
  const absolute = path.join(configDefaults.engine.artifactPath, relativePath);
  await fs.promises.rm(absolute, { force: true });
};

/**
 * Wrap the SDK artifact downloader and gateway URL builder so proofs fall back
 * across the configured gateway list. Idempotent; call once before the engine
 * starts downloading artifacts.
 *
 * Reaches the SDK's internal modules by absolute path because the package's
 * `exports` map does not expose them, but the modules are the same cache
 * entries the SDK itself uses, so mutating their exports is picked up.
 */
export const installArtifactGatewayPatch = (): void => {
  if (installed) return;
  installed = true;

  try {
    const indexPath = require.resolve("@railgun-community/wallet");
    const distDir = path.dirname(indexPath);
    const utilModule = require(
      path.join(distDir, "services/artifacts/artifact-util.js"),
    ) as ArtifactUtilModule;
    const downloaderModule = require(
      path.join(distDir, "services/artifacts/artifact-downloader.js"),
    ) as ArtifactDownloaderModule;

    const originalGetArtifactUrl = utilModule.getArtifactUrl;
    // The downloader calls getArtifactUrl at request time, so swapping the
    // export redirects every artifact fetch to the active gateway.
    let activeGateway = OFFICIAL_ARTIFACT_GATEWAY;
    utilModule.getArtifactUrl = (artifactName, variant) =>
      replaceGatewayOrigin(
        originalGetArtifactUrl(artifactName, variant),
        activeGateway,
      );

    const OriginalArtifactDownloader = downloaderModule.ArtifactDownloader;

    const PatchedArtifactDownloader = function (
      this: unknown,
      store: ArtifactDownloadStore,
      useNativeArtifacts: boolean,
    ): ArtifactDownloaderInstance {
      const downloader = new OriginalArtifactDownloader(
        store,
        useNativeArtifacts,
      );
      const originalDownloadArtifact = downloader.downloadArtifact;
      const originalDownloadArtifacts = downloader.downloadArtifacts;

      downloader.downloadArtifact = async (artifactName, variant) => {
        const artifactPath = await originalDownloadArtifact(
          artifactName,
          variant,
        );
        if (artifactName === ArtifactName.VKEY) {
          const body = await downloader.artifactStore.get(artifactPath);
          if (!isValidVkeyArtifact(body)) {
            await removeStoredArtifact(artifactPath);
            throw new Error(
              `Artifact gateway returned an invalid vkey for ${variant}.`,
            );
          }
        }
        return artifactPath;
      };

      downloader.downloadArtifacts = async (variant) => {
        // Resolved per download so a local-config loaded after engine init (or
        // switched at runtime) is still honoured.
        const gateways = resolveArtifactGateways(remoteConfig?.artifactGateways);

        // Circuits are fetched by individual file CID: a directory CID is
        // often unresolvable even when the files themselves are pinned.
        if (
          isKnownVariant(variant) &&
          (await ensureCircuitArtifacts(variant, downloader.artifactStore, gateways))
        ) {
          return;
        }

        let lastError: unknown;
        for (const gateway of gateways) {
          activeGateway = gateway;
          try {
            await originalDownloadArtifacts(variant);
            return;
          } catch (err) {
            lastError = err;
            log.warn(
              `artifact download from ${gatewayHost(gateway)} failed for ${variant}; trying next gateway`,
            );
          }
        }
        throw lastError instanceof Error
          ? lastError
          : new Error(`Could not download ${variant} from any artifact gateway.`);
      };

      return downloader;
    } as unknown as ArtifactDownloaderCtor;

    PatchedArtifactDownloader.prototype = OriginalArtifactDownloader.prototype;
    downloaderModule.ArtifactDownloader = PatchedArtifactDownloader;

    log.info("artifact gateway fallback enabled");
  } catch (err) {
    // Never let a patch failure stop the engine from booting; the SDK's own
    // gateway remains the only path, exactly as before this module existed.
    log.warn(`artifact gateway patch not applied: ${String(err)}`);
  }
};

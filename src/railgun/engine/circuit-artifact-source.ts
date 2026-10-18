/**
 * Proving artifacts addressed by individual file CID.
 *
 * The wallet SDK fetches each circuit as a directory tree under one CID from
 * its hardcoded gateway. An IPFS node can hold the individual files yet fail
 * to resolve a directory CID (the POI bundle `QmZ2MyM6…` is the usual one),
 * which makes the SDK's download fail and every private proof report the
 * misleading "Invalid proof for this transaction".
 *
 * This module provisions the same files by their own CIDs — the addresses
 * railoxide uses in railgun-rust `artifact-cids.json` for
 * `@railgun-community/wallet` 11.2.0 — verifies each decompressed SHA-256
 * against the SDK's own `artifact-v2-hashes.json`, and writes it into the
 * cache layout the SDK checks before it would download. Once present, the
 * SDK's `exists()` short-circuits and never requests the directory CID.
 *
 * vkeys have no per-file CID, so each is exported from the verified zkey with
 * snarkjs.
 *
 * Kept self-contained so the only SDK hook remains the single downloader wrap
 * in `artifact-gateway.ts`; upstream files stay untouched.
 */
import { createHash } from "node:crypto";
import path from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { zKey } from "snarkjs";
import { createLogger } from "../../platform/logger";
// Copied from railgun-rust, the checkout railoxide pins for wallet 11.2.0:
//   triamazikamno/railgun-rust @ 3cb3f9af8744e84f445b5305b493d24e42331c56
//   crates/railgun-wallet/resources/metadata/artifact-cids.json
// Re-copy from the same path when the wallet or that pin moves.
import ARTIFACT_CIDS from "./resources/artifact-cids.json";

const log = createLogger("circuit-artifacts");

/** The bundle `@railgun-community/wallet` 11.2.0 selects for POI circuits. */
export const POI_BUNDLE_CID =
  "QmZ2MyM6TKxffkv6stuo2hFwmUfs3q4xgMYN164Sje8new";

/** Per-file fetch timeout. The 13x13 zkey is ~28 MB compressed. */
const FETCH_TIMEOUT_MS = 120_000;

type CidMap = Record<string, { zkey: { cid: string }; wasm: { cid: string } }>;
type HashMap = Record<string, { zkey: string; wasm: string }>;

const CID_MAP = ARTIFACT_CIDS as unknown as CidMap;

let sdkHashes: HashMap | undefined;

/**
 * The SDK's own expected hashes, read from the installed package so they stay
 * tied to the wallet version. Reached by absolute path because the package
 * `exports` map does not expose the internal JSON.
 */
const loadSdkHashes = (): HashMap => {
  if (sdkHashes) return sdkHashes;
  const indexPath = require.resolve("@railgun-community/wallet");
  const distDir = path.dirname(indexPath);
  sdkHashes = require(
    path.join(distDir, "services/artifacts/json/artifact-v2-hashes.json"),
  ) as HashMap;
  return sdkHashes;
};

/** Store surface the SDK's ArtifactStore exposes and this module needs. */
export type CircuitArtifactStore = {
  get: (path: string) => Promise<string | Uint8Array | null>;
  exists: (path: string) => Promise<boolean>;
  store: (dir: string, path: string, item: string | Uint8Array) => Promise<void>;
};

export const isKnownVariant = (variant: string): boolean =>
  Object.prototype.hasOwnProperty.call(CID_MAP, variant);

export const artifactCacheDir = (variant: string): string =>
  variant.startsWith("POI_")
    ? `artifacts-v2.1/${POI_BUNDLE_CID}/${variant}`
    : `artifacts-v2.1/${variant}`;

/** Cache paths the SDK reads, relative to the artifact store root. */
export const artifactPaths = (
  variant: string,
): { dir: string; vkey: string; zkey: string; wasm: string } => {
  const dir = artifactCacheDir(variant);
  return {
    dir,
    vkey: `${dir}/vkey.json`,
    zkey: `${dir}/zkey`,
    wasm: `${dir}/wasm`,
  };
};

/**
 * Brotli-decompress and hash-check a downloaded file. Throws on a bad body so
 * a gateway error page is never written into the trusted artifact cache.
 */
export const decodeAndVerify = (
  compressed: Uint8Array,
  expectedSha256: string,
): Uint8Array => {
  const data = brotliDecompressSync(compressed);
  const actual = createHash("sha256").update(data).digest("hex");
  if (actual !== expectedSha256) {
    throw new Error(
      `artifact hash mismatch: got ${actual}, expected ${expectedSha256}`,
    );
  }
  return data;
};

/** Export the snarkjs verification key from decompressed zkey bytes. */
export const exportVkeyFromZkey = async (
  zkeyBytes: Uint8Array,
): Promise<string> => {
  const vkey = await zKey.exportVerificationKey(zkeyBytes);
  return JSON.stringify(vkey);
};

const gatewayHost = (gateway: string): string => {
  try {
    return new URL(gateway).host;
  } catch {
    return gateway;
  }
};

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const fetchVerified = async (
  cid: string,
  expectedSha256: string,
  gateways: string[],
  label: string,
): Promise<Uint8Array> => {
  let lastError: unknown;
  for (const gateway of gateways) {
    try {
      const response = await fetch(`${gateway}/ipfs/${cid}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const compressed = new Uint8Array(await response.arrayBuffer());
      return decodeAndVerify(compressed, expectedSha256);
    } catch (err) {
      lastError = err;
      log.warn(
        `${label} from ${gatewayHost(gateway)} failed: ${errorMessage(err)}`,
      );
    }
  }
  throw new Error(`Could not download ${label} from any artifact gateway.`, {
    cause: lastError,
  });
};

const asBytes = (stored: string | Uint8Array | null): Uint8Array | undefined => {
  if (stored == null) return undefined;
  return typeof stored === "string"
    ? new Uint8Array(Buffer.from(stored, "utf8"))
    : new Uint8Array(stored);
};

/**
 * Provision one circuit variant from per-file CIDs into the SDK cache layout.
 *
 * Returns true when every file is present afterwards (written now or already
 * cached), false when the files could not be obtained so the caller can fall
 * back to the SDK's directory-CID download.
 */
export const ensureCircuitArtifacts = async (
  variant: string,
  store: CircuitArtifactStore,
  gateways: string[],
): Promise<boolean> => {
  const cids = CID_MAP[variant];
  const hashes = loadSdkHashes()[variant];
  if (!cids || !hashes) return false;

  const paths = artifactPaths(variant);
  try {
    let zkeyBytes: Uint8Array | undefined;

    if (!(await store.exists(paths.zkey))) {
      zkeyBytes = await fetchVerified(
        cids.zkey.cid,
        hashes.zkey,
        gateways,
        `${variant}/zkey`,
      );
      await store.store(paths.dir, paths.zkey, zkeyBytes);
    }

    if (!(await store.exists(paths.wasm))) {
      const wasm = await fetchVerified(
        cids.wasm.cid,
        hashes.wasm,
        gateways,
        `${variant}/wasm`,
      );
      await store.store(paths.dir, paths.wasm, wasm);
    }

    if (!(await store.exists(paths.vkey))) {
      const bytes = zkeyBytes ?? asBytes(await store.get(paths.zkey));
      if (!bytes) {
        throw new Error(`no zkey available to export vkey for ${variant}`);
      }
      await store.store(paths.dir, paths.vkey, await exportVkeyFromZkey(bytes));
    }

    log.info(`provisioned ${variant} artifacts from file CIDs`);
    return true;
  } catch (err) {
    log.warn(
      `could not provision ${variant} from file CIDs: ${errorMessage(err)}`,
    );
    return false;
  }
};

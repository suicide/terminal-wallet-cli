/**
 * Artifact gateway configuration.
 *
 * The Railgun SDK hardcodes a single artifact gateway. These tests pin the
 * pure pieces that let an operator add fallbacks via local-config.json:
 * gateway normalisation, list resolution, URL rewriting, and the vkey shape
 * check that keeps a bad 200 response out of the artifact cache.
 *
 * No network or SDK download is exercised here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OFFICIAL_ARTIFACT_GATEWAY,
  normaliseArtifactGateway,
  parseArtifactGateways,
  replaceGatewayOrigin,
  resolveArtifactGateways,
  isValidVkeyArtifact,
} from "../../../src/railgun/engine/artifact-gateway";
import { isValidRemoteConfig } from "../../../src/railgun/network/validate-remote-config";

const CID = "QmZ2MyM6TKxffkv6stuo2hFwmUfs3q4xgMYN164Sje8new";
const POI_URL = `https://ipfs-lb.com/ipfs/${CID}/circuits/13x13/vkey.json`;

const validVkey = JSON.stringify({
  protocol: "groth16",
  curve: "bn128",
  nPublic: 6,
  vk_alpha_1: ["1", "2"],
});

test("normaliseArtifactGateway keeps a bare origin", () => {
  assert.equal(normaliseArtifactGateway("https://ipfs.example.com"), "https://ipfs.example.com");
});

test("normaliseArtifactGateway trims whitespace and a trailing slash", () => {
  assert.equal(
    normaliseArtifactGateway("  https://ipfs.example.com/  "),
    "https://ipfs.example.com",
  );
});

test("normaliseArtifactGateway strips a pasted /ipfs suffix", () => {
  assert.equal(
    normaliseArtifactGateway("https://ipfs.example.com/ipfs"),
    "https://ipfs.example.com",
  );
});

test("normaliseArtifactGateway keeps a base path", () => {
  assert.equal(
    normaliseArtifactGateway("https://proxy.example.com/ipfs"),
    "https://proxy.example.com",
  );
  assert.equal(
    normaliseArtifactGateway("https://proxy.example.com/gw/ipfs/"),
    "https://proxy.example.com/gw",
  );
});

test("normaliseArtifactGateway rejects non-http and unparseable values", () => {
  assert.equal(normaliseArtifactGateway("ftp://ipfs.example.com"), undefined);
  assert.equal(normaliseArtifactGateway("not a url"), undefined);
  assert.equal(normaliseArtifactGateway(""), undefined);
  assert.equal(normaliseArtifactGateway(42), undefined);
  assert.equal(normaliseArtifactGateway(null), undefined);
});

test("parseArtifactGateways normalises, dedupes, and counts rejects", () => {
  const { gateways, rejected } = parseArtifactGateways([
    "https://a.example.com",
    "https://a.example.com/ipfs",
    "https://b.example.com/",
    "nonsense",
    7,
  ]);
  assert.deepEqual(gateways, [
    "https://a.example.com",
    "https://b.example.com",
  ]);
  assert.equal(rejected, 2);
});

test("parseArtifactGateways on a non-array is empty and rejects nothing", () => {
  assert.deepEqual(parseArtifactGateways("https://a.example.com"), {
    gateways: [],
    rejected: 0,
  });
  assert.deepEqual(parseArtifactGateways(undefined), {
    gateways: [],
    rejected: 0,
  });
});

test("resolveArtifactGateways appends the official gateway last", () => {
  assert.deepEqual(
    resolveArtifactGateways(["https://internal.example.com"]),
    ["https://internal.example.com", OFFICIAL_ARTIFACT_GATEWAY],
  );
});

test("resolveArtifactGateways does not duplicate the official gateway", () => {
  assert.deepEqual(resolveArtifactGateways([OFFICIAL_ARTIFACT_GATEWAY]), [
    OFFICIAL_ARTIFACT_GATEWAY,
  ]);
});

test("resolveArtifactGateways with nothing configured yields only the official gateway", () => {
  assert.deepEqual(resolveArtifactGateways(undefined), [
    OFFICIAL_ARTIFACT_GATEWAY,
  ]);
});

test("replaceGatewayOrigin rewrites the origin and keeps the /ipfs tail", () => {
  assert.equal(
    replaceGatewayOrigin(POI_URL, "https://internal.example.com"),
    `https://internal.example.com/ipfs/${CID}/circuits/13x13/vkey.json`,
  );
});

test("replaceGatewayOrigin preserves a gateway base path", () => {
  assert.equal(
    replaceGatewayOrigin(POI_URL, "https://proxy.example.com/gw"),
    `https://proxy.example.com/gw/ipfs/${CID}/circuits/13x13/vkey.json`,
  );
});

test("replaceGatewayOrigin leaves non-artifact URLs untouched", () => {
  assert.equal(
    replaceGatewayOrigin("https://rpc.example.com", "https://internal.example.com"),
    "https://rpc.example.com",
  );
});

test("isValidVkeyArtifact accepts a snarkjs verification key", () => {
  assert.equal(isValidVkeyArtifact(validVkey), true);
  assert.equal(isValidVkeyArtifact(Buffer.from(validVkey)), true);
});

test("isValidVkeyArtifact rejects an HTML or placeholder body", () => {
  assert.equal(isValidVkeyArtifact("<html><body>502</body></html>"), false);
  assert.equal(isValidVkeyArtifact("Hello from IPFS Gateway Checker"), false);
});

test("isValidVkeyArtifact rejects JSON that is not a vkey", () => {
  assert.equal(isValidVkeyArtifact("{}"), false);
  assert.equal(isValidVkeyArtifact(JSON.stringify({ protocol: "groth16" })), false);
  assert.equal(isValidVkeyArtifact(JSON.stringify([1, 2, 3])), false);
  assert.equal(isValidVkeyArtifact(null), false);
});

test("isValidRemoteConfig accepts an optional artifactGateways array", () => {
  const base = {
    currentVersionNumber: "2.0.0",
    minVersionNumber: "2.0.0",
    bootstrap: [],
    wakuPubSubTopic: "/waku/2/rs/5/1",
    additionalDirectPeers: [],
    blacklist: [],
    publicPoiAggregatorUrls: [],
    network: {
      1: { name: "Ethereum", providers: ["https://rpc.example.com"] },
    },
    trustedFeeSigner: "0zk1test",
    artifactGateways: ["https://internal.example.com"],
  };
  assert.equal(isValidRemoteConfig(base), true);
});
